package devenv

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
)

const syncDomainRepairProcedure = "vip_sync_update_blog_domains"

type PostImportRepairError struct {
	Err              error
	RepairsCommitted bool
}

func (e *PostImportRepairError) Error() string {
	if e == nil {
		return ""
	}
	if e.RepairsCommitted {
		return fmt.Sprintf("the database was imported and domain repairs committed, but temporary repair cleanup failed: %v", e.Err)
	}
	return fmt.Sprintf("the database was imported, but multisite domain repair failed; no partial domain repairs were committed: %v", e.Err)
}

func (e *PostImportRepairError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func quoteSQLString(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func normalizedDomainRepairs(repairs []DomainRepair) ([]DomainRepair, error) {
	targetsBySource := map[string]string{}
	seen := map[string]bool{}
	out := make([]DomainRepair, 0, len(repairs))
	for _, repair := range repairs {
		if repair.BlogID < 0 {
			return nil, fmt.Errorf("invalid negative blog ID %d", repair.BlogID)
		}
		if !validDNSHost(repair.SourceDomain) || !validDNSHost(repair.TargetDomain) {
			return nil, fmt.Errorf("invalid domain repair %q -> %q", repair.SourceDomain, repair.TargetDomain)
		}
		if target, exists := targetsBySource[repair.SourceDomain]; exists && target != repair.TargetDomain {
			return nil, fmt.Errorf("conflicting domain repair for %q", repair.SourceDomain)
		}
		targetsBySource[repair.SourceDomain] = repair.TargetDomain
		key := fmt.Sprintf("%d\x00%s\x00%s", repair.BlogID, repair.SourceDomain, repair.TargetDomain)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, repair)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].BlogID != out[j].BlogID {
			return out[i].BlogID < out[j].BlogID
		}
		if out[i].SourceDomain != out[j].SourceDomain {
			return out[i].SourceDomain < out[j].SourceDomain
		}
		return out[i].TargetDomain < out[j].TargetDomain
	})
	return out, nil
}

func buildDomainRepairSQL(repairs []DomainRepair) (string, error) {
	repairs, err := normalizedDomainRepairs(repairs)
	if err != nil {
		return "", err
	}
	if len(repairs) == 0 {
		return "", nil
	}

	var b strings.Builder
	fmt.Fprintf(&b, "DROP PROCEDURE IF EXISTS %s;\n", syncDomainRepairProcedure)
	b.WriteString("DELIMITER $$\n")
	fmt.Fprintf(&b, "CREATE PROCEDURE %s()\n", syncDomainRepairProcedure)
	b.WriteString("BEGIN\n")
	b.WriteString("    DECLARE EXIT HANDLER FOR SQLEXCEPTION\n")
	b.WriteString("    BEGIN\n")
	b.WriteString("        ROLLBACK;\n")
	b.WriteString("        RESIGNAL;\n")
	b.WriteString("    END;\n")
	b.WriteString("    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'wordpress' AND table_name = 'wp_blogs') THEN\n")
	b.WriteString("        START TRANSACTION;\n")
	for _, repair := range repairs {
		fmt.Fprintf(&b, "        UPDATE wordpress.wp_blogs SET domain = %s WHERE ", quoteSQLString(repair.TargetDomain))
		if repair.BlogID > 0 {
			fmt.Fprintf(&b, "blog_id = %d AND ", repair.BlogID)
		}
		fmt.Fprintf(&b, "domain = %s;\n", quoteSQLString(repair.SourceDomain))
	}
	b.WriteString("        COMMIT;\n")
	b.WriteString("    END IF;\n")
	b.WriteString("END$$\n")
	b.WriteString("DELIMITER ;\n")
	fmt.Fprintf(&b, "CALL %s();\n", syncDomainRepairProcedure)
	return b.String(), nil
}

type domainRepairRunner interface {
	Compose(context.Context, string, ...string) error
	ComposeStdin(context.Context, string, io.Reader, ...string) error
}

func domainRepairCleanupArgs() []string {
	return []string{
		"exec", "-T", phpService,
		"wp", "--allow-root", "db", "query",
		"DROP PROCEDURE IF EXISTS " + syncDomainRepairProcedure,
	}
}

func domainRepairQueryArgs() []string {
	return []string{"exec", "-T", phpService, "wp", "--allow-root", "db", "query"}
}

func repairBlogDomainsWith(ctx context.Context, runner domainRepairRunner, slug string, repairs []DomainRepair) (resultErr error) {
	if len(repairs) == 0 {
		return nil
	}
	script, err := buildDomainRepairSQL(repairs)
	if err != nil {
		return &PostImportRepairError{Err: err}
	}
	cleanupArgs := domainRepairCleanupArgs()
	if err := runner.Compose(ctx, slug, cleanupArgs...); err != nil {
		return &PostImportRepairError{Err: fmt.Errorf("prepare repair procedure: %w", err)}
	}
	defer func() {
		if cleanupErr := runner.Compose(ctx, slug, cleanupArgs...); cleanupErr != nil {
			if resultErr != nil {
				resultErr = errors.Join(resultErr, fmt.Errorf("cleanup repair procedure: %w", cleanupErr))
				return
			}
			resultErr = &PostImportRepairError{
				Err:              fmt.Errorf("cleanup repair procedure: %w", cleanupErr),
				RepairsCommitted: true,
			}
		}
	}()
	if err := runner.ComposeStdin(ctx, slug, strings.NewReader(script), domainRepairQueryArgs()...); err != nil {
		return &PostImportRepairError{Err: fmt.Errorf("execute repair transaction: %w", err)}
	}
	return nil
}

// RepairBlogDomains applies the final plan's typed domain repairs to the local
// database. The procedure handler rolls back every repair if any update fails;
// cleanup is attempted independently before and after execution.
func RepairBlogDomains(ctx context.Context, slug string, repairs []DomainRepair) error {
	if len(repairs) == 0 {
		return nil
	}
	runner, err := newRunner(ctx)
	if err != nil {
		return &PostImportRepairError{Err: err}
	}
	return repairBlogDomainsWith(ctx, runner, slug, repairs)
}
