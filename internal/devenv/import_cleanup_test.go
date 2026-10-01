package devenv

import (
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
)

type sanitationRunner struct {
	fakeImportRunner
	events []string
	fail   bool
}

func (r *sanitationRunner) Compose(ctx context.Context, slug string, args ...string) error {
	r.events = append(r.events, strings.Join(args, " "))
	return r.fakeImportRunner.Compose(ctx, slug, args...)
}
func (r *sanitationRunner) ComposeStdin(_ context.Context, _ string, body io.Reader, args ...string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	event := strings.Join(args, " ")
	if strings.Contains(string(data), "CREATE PROCEDURE vip_local_import_sanitize") {
		event = "sanitize"
		if r.fail {
			r.events = append(r.events, event)
			return errors.New("sanitation failed")
		}
	}
	r.events = append(r.events, event)
	return nil
}

func TestImportSanitizesBeforeWordPress(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "failure"}[fail], func(t *testing.T) {
			seedImportEnv(t)
			r := &sanitationRunner{fail: fail}
			err := importSQL(context.Background(), r, "e", writeDump(t), ImportOptions{Quiet: true})
			events := strings.Join(r.events, "\n")
			if fail {
				if err == nil || !strings.Contains(err.Error(), "credential cleanup failed") {
					t.Fatalf("error = %v", err)
				}
				if strings.Contains(events, "cache flush") || strings.Contains(events, "dev-env-add-admin") {
					t.Fatalf("bootstrapped after failure: %s", events)
				}
			} else if err != nil {
				t.Fatal(err)
			}
			sanitize := strings.Index(events, "sanitize\n")
			if sanitize < 0 {
				t.Fatalf("no sanitation: %s", events)
			}
			if first := strings.Index(events, "cache flush"); first >= 0 && first < sanitize {
				t.Fatalf("too late: %s", events)
			}
		})
	}
}

func TestMyDumperSanitizesBeforeSearchReplace(t *testing.T) {
	seedImportEnv(t)
	r := &sanitationRunner{}
	err := importMyDumperDump(context.Background(), r, "e", writeDump(t), "wordpress", ImportOptions{SearchReplace: []string{"old,new"}})
	if err != nil {
		t.Fatal(err)
	}
	events := strings.Join(r.events, "\n")
	if i, j := strings.Index(events, "sanitize\n"), strings.Index(events, "search-replace"); i < 0 || j < i {
		t.Fatalf("order: %s", events)
	}
}

func TestImportCredentialSQLMatchesNodeAsset(t *testing.T) {
	nodeSQL, err := os.ReadFile("../../assets/dev-env-import-cleanup.sql")
	if err != nil {
		t.Fatal(err)
	}
	if string(nodeSQL) != importCredentialCleanupSQL {
		t.Fatal("Node and Go credential sanitation SQL differs")
	}
}

func TestImportCacheFlushMatchesNodeAsset(t *testing.T) {
	nodePHP, err := os.ReadFile("../../assets/dev-env-import-cache-flush.php")
	if err != nil {
		t.Fatal(err)
	}
	if string(nodePHP) != importCacheFlushPHP {
		t.Fatal("Node and Go pre-bootstrap cache flush differs")
	}
}
func TestImportStopsWhenDirectCacheFlushFails(t *testing.T) {
	seedImportEnv(t)
	r := &sanitationRunner{}
	r.failOn = "php -r"
	err := importSQL(context.Background(), r, "e", writeDump(t), ImportOptions{Quiet: true})
	if err == nil || !strings.Contains(err.Error(), "credential cleanup failed") {
		t.Fatalf("error = %v", err)
	}
	if strings.Contains(strings.Join(r.events, "\n"), "wp --allow-root cache flush") {
		t.Fatal("WordPress bootstrapped after cache failure")
	}
}
