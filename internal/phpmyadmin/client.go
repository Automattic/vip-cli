// Package phpmyadmin implements the enable + poll + generate flow for
// `vip db phpmyadmin`. The Node implementation in src/commands/phpmyadmin.ts
// treats this as one user-visible operation but internally fires up to three
// GraphQL operations, gated by maybeEnablePhpMyAdmin (phpmyadmin.ts:213):
//
//	private async maybeEnablePhpMyAdmin(): Promise< void > {
//		const status = await this.getStatus();
//		if ( ! [ 'running', 'enabled' ].includes( status ) ) {
//			await enablePhpMyAdmin( this.env.id as number );
//			await pollUntil( this.getStatus.bind( this ), 1000, ( sts: string ) => sts === 'running' );
//			// Additional 30s for LB routing to be updated
//			await setTimeout( 30_000 );
//		}
//	}
//
// So:
//
//  1. PhpMyAdminStatus query — always. When it already reads "running" or
//     "enabled" the whole enable branch is skipped: no mutation, no poll, no
//     load-balancer wait.
//  2. EnablePhpMyAdmin mutation — only when the environment is not already up.
//  3. PhpMyAdminStatus polled at a 1s tick until status == "running", under
//     pollUntil's default 6h ceiling (utils.ts:18) — NOT a 60s one; a cold
//     environment can legitimately take many minutes.
//  4. A 30s settle for LB routing, then GeneratePhpMyAdminAccess.
package phpmyadmin

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Khan/genqlient/graphql"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/poll"
)

// Node's timings (src/commands/phpmyadmin.ts:217,220 + src/lib/utils.ts:18).
const (
	// DefaultPollInterval is pollUntil's 1000ms tick.
	DefaultPollInterval = 1 * time.Second
	// DefaultPollTimeout is pollUntil's default ceiling: Node passes no
	// timeout here, so the poll may legitimately run for six hours.
	DefaultPollTimeout = poll.DefaultTimeout
	// DefaultPostEnableWait is the "Additional 30s for LB routing to be
	// updated" settle after a cold enable.
	DefaultPostEnableWait = 30 * time.Second
)

// RunOpts configures Run. Stderr is the progress sink. The durations are
// exposed so callers (and tests) can shorten the waits; leave them zero to
// pick up Node's values.
type RunOpts struct {
	Silent       bool
	Stderr       io.Writer
	PollInterval time.Duration
	PollTimeout  time.Duration
	// PostEnableWait is the LB settle after enabling. A negative value
	// skips it; zero means DefaultPostEnableWait.
	PostEnableWait time.Duration

	// sleep is the clock seam for PostEnableWait. Production leaves it nil
	// (time.Sleep); tests inject a recorder so the 30s settle costs nothing.
	sleep func(time.Duration)
}

// resolveRunOpts fills in Node's defaults for anything the caller left zero.
// It is a plain function so the resolved ceiling can be asserted directly —
// proving the poll really runs with the 6h value without a 6h test.
func resolveRunOpts(o RunOpts) RunOpts {
	if o.Stderr == nil {
		o.Stderr = io.Discard
	}
	if o.PollInterval == 0 {
		o.PollInterval = DefaultPollInterval
	}
	if o.PollTimeout == 0 {
		o.PollTimeout = DefaultPollTimeout
	}
	if o.PostEnableWait == 0 {
		o.PostEnableWait = DefaultPostEnableWait
	}
	if o.sleep == nil {
		o.sleep = time.Sleep
	}
	return o
}

// Result is what Run returns on success.
type Result struct {
	URL string
}

const (
	permissionErrorMessage = "You do not have sufficient permission to access phpMyAdmin for this environment."
	enableErrorMessage     = "Failed to enable phpMyAdmin. Please try again. If the problem persists, please contact support."
)

type userError struct {
	message string
	cause   error
}

func (e *userError) Error() string { return e.message }
func (e *userError) Unwrap() error { return e.cause }

func enableFailure(err error) error {
	if hasGraphQLErrorMessage(err, "Unauthorized") {
		return &userError{message: permissionErrorMessage, cause: err}
	}
	return &userError{message: enableErrorMessage, cause: err}
}

func generateFailure(err error) error {
	return &userError{message: "Failed to generate phpMyAdmin URL: " + err.Error(), cause: err}
}

func hasGraphQLErrorMessage(err error, want string) bool {
	var list gqlerror.List
	if errors.As(err, &list) {
		for _, item := range list {
			if item != nil && item.Message == want {
				return true
			}
		}
	}
	var single *gqlerror.Error
	return errors.As(err, &single) && single != nil && single.Message == want
}

// Run executes the flow. Returns the generated access URL on success, or a
// wrapped error on any step's failure.
func Run(ctx context.Context, c graphql.Client, appID, envID int64, opts RunOpts) (*Result, error) {
	opts = resolveRunOpts(opts)

	getStatus := func(ctx context.Context) (string, error) {
		statusResp, err := gql.PhpMyAdminStatus(ctx, c, appID, envID)
		if err != nil {
			return "", err
		}
		return readPhpMyAdminStatus(statusResp), nil
	}

	// Node's progress tracker marks the ENABLE step running before
	// maybeEnablePhpMyAdmin, whether or not the mutation ends up firing.
	if !opts.Silent {
		fmt.Fprintln(opts.Stderr, "Enabling phpMyAdmin for this environment...")
	}

	// 1. Status first. This is the short-circuit Go was missing: without it
	// every single invocation fired an extra enable mutation.
	status, err := getStatus(ctx)
	if err != nil {
		return nil, enableFailure(err)
	}

	if status != "running" && status != "enabled" {
		// 2. Enable.
		enableInput := &gql.EnablePhpMyAdminInput{EnvironmentId: envID}
		enableResp, err := gql.EnablePhpMyAdmin(ctx, c, enableInput)
		if err != nil {
			return nil, enableFailure(err)
		}
		if enableResp == nil || enableResp.EnablePHPMyAdmin == nil ||
			enableResp.EnablePHPMyAdmin.Success == nil || !*enableResp.EnablePHPMyAdmin.Success {
			return nil, enableFailure(errors.New("phpMyAdmin enablement did not succeed"))
		}

		// 3. Poll status until "running", under the 6h ceiling.
		if !opts.Silent {
			fmt.Fprintln(opts.Stderr, "Waiting for phpMyAdmin to be ready...")
		}
		last, perr := poll.Until(ctx, getStatus, opts.PollInterval,
			func(s string) bool { return s == "running" }, opts.PollTimeout)
		if perr != nil {
			return nil, enableFailure(fmt.Errorf("poll phpMyAdmin status (last status %q): %w", last, perr))
		}

		// 4. LB settle.
		if opts.PostEnableWait > 0 {
			opts.sleep(opts.PostEnableWait)
		}
	}

	// 5. Generate access URL.
	if !opts.Silent {
		fmt.Fprintln(opts.Stderr, "Generating phpMyAdmin access link...")
	}
	genInput := &gql.GeneratePhpMyAdminAccessInput{EnvironmentId: envID}
	genResp, err := gql.GeneratePhpMyAdminAccess(ctx, c, genInput)
	if err != nil {
		return nil, generateFailure(err)
	}
	if genResp == nil || genResp.GeneratePHPMyAdminAccess == nil ||
		genResp.GeneratePHPMyAdminAccess.Url == nil || *genResp.GeneratePHPMyAdminAccess.Url == "" {
		return nil, generateFailure(errors.New("phpMyAdmin access response missing URL"))
	}
	return &Result{URL: *genResp.GeneratePHPMyAdminAccess.Url}, nil
}

// readPhpMyAdminStatus pulls resp.App.Environments[0].PhpMyAdminStatus.Status
// in a nil-safe way. Genqlient generates pointers all the way down for
// optional fields, so we have to walk carefully.
func readPhpMyAdminStatus(resp *gql.PhpMyAdminStatusResponse) string {
	if resp == nil || resp.App == nil {
		return ""
	}
	envs := resp.App.Environments
	if len(envs) == 0 || envs[0] == nil {
		return ""
	}
	pma := envs[0].PhpMyAdminStatus
	if pma == nil || pma.Status == nil {
		return ""
	}
	return *pma.Status
}
