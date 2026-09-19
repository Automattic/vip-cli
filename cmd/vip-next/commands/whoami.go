package commands

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	json "encoding/json/v2"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/telemetry"
)

// Config holds runtime values that main.go injects before cobra dispatches.
type Config struct {
	APIHost string
	Token   string
	// Middleware is the ordered (outermost first) gql.Middleware stack that
	// handlers should attach to gql.Client instances. Wired by main.go.
	// Per the M3 contract: error → rechallenge → retry → transport.
	Middleware []gql.Middleware

	// M4 additions:
	// GQLClient is the genqlient client wrapped around the same middleware
	// chain (via gql.HTTPClientWithMiddleware). Handlers and appctx
	// middleware share this single client.
	GQLClient graphql.Client
	// Tracker emits telemetry events. Never nil in production — main.go
	// constructs telemetry.NewDefault(), which returns a disabled tracker
	// rather than nil when DO_NOT_TRACK / test env signals opt-out.
	Tracker *telemetry.Tracker
	// AppCtxConfig is consumed by appctx.WithAppContext to resolve --app
	// against the GraphQL API.
	AppCtxConfig appctx.AppContextConfig
}

// pkgConfig is process-wide mutable state. DO NOT call t.Parallel() in any
// test that calls SetConfig — the AppCtxConfig.Client and Tracker fields are
// per-invocation in production but per-test in tests, and parallel tests
// would race over them. If a future test needs parallelism, refactor so the
// Config flows through cmd.Context() instead of this package var.
var pkgConfig Config

// SetConfig stores runtime config (called by main.go after token validation,
// or by tests). See the pkgConfig comment re: t.Parallel().
func SetConfig(c Config) { pkgConfig = c }

// GetConfig returns the currently stored runtime config.
func GetConfig() Config { return pkgConfig }

const meQuery = `{"operationName":"Me","query":"query Me {\n  me {\n    id\n    displayName\n    isVIP\n  }\n}"}`

type WhoamiDeps struct {
	APIHost string
	Token   string
	Client  *gql.Client
	Stdout  io.Writer
}

func RunWhoami(deps WhoamiDeps) error {
	if deps.Stdout == nil {
		deps.Stdout = os.Stdout
	}
	if deps.Client == nil {
		deps.Client = gql.NewClient(gql.Config{
			APIHost:    deps.APIHost,
			Token:      deps.Token,
			Middleware: pkgConfig.Middleware,
		})
	}
	req, err := http.NewRequest("POST", deps.APIHost+"/graphql", strings.NewReader(meQuery))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := deps.Client.Do(req)
	if err != nil {
		return fmt.Errorf("Failed to fetch information about the currently logged-in user error: %s", err.Error())
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var doc struct {
		Data struct {
			Me *struct {
				ID          int64  `json:"id"`
				DisplayName string `json:"displayName"`
				IsVIP       bool   `json:"isVIP"`
			} `json:"me"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return fmt.Errorf("Failed to fetch information about the currently logged-in user error: %s", err.Error())
	}
	if doc.Data.Me == nil {
		return errors.New("The API did not return any information about the user.")
	}

	displayName := doc.Data.Me.DisplayName
	if displayName == "" {
		displayName = "user"
	}
	var id string
	if doc.Data.Me.ID != 0 {
		id = fmt.Sprintf("%d", doc.Data.Me.ID)
	} else {
		id = " not found"
	}

	fmt.Fprintf(deps.Stdout, "- Howdy %s!\n", displayName)
	fmt.Fprintf(deps.Stdout, "- Your user ID is %s\n", id)
	if doc.Data.Me.IsVIP {
		fmt.Fprintln(deps.Stdout, "- Your account has VIP Staff permissions")
	}
	return nil
}

// NewWhoamiCmd returns a cobra.Command that wraps RunWhoami.
func NewWhoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Retrieve details about the current authenticated VIP-CLI user.",
		Long:  "Retrieve details about the current authenticated VIP-CLI user.",
		RunE: func(cmd *cobra.Command, args []string) error {
			host := pkgConfig.APIHost
			if host == "" {
				host = defaultAPIHost()
			}
			return RunWhoami(WhoamiDeps{
				APIHost: host,
				Token:   pkgConfig.Token,
			})
		},
	}
}

func defaultAPIHost() string {
	if h := os.Getenv("API_HOST"); h != "" {
		return h
	}
	return "https://api.wpvip.com"
}
