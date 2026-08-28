package gql

import (
	"net/http"

	"github.com/Automattic/vip/internal/httpproxy"
)

// Doer mirrors genqlient's interface plus what middleware needs.
type Doer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Middleware wraps a Doer with a new Doer.
type Middleware func(next Doer) Doer

// Config selects the GraphQL endpoint and per-environment behaviors.
type Config struct {
	APIHost     string // e.g. "https://api.wpvip.com"
	TestMode    bool   // if true, skip the x_query rewrite (matches NODE_ENV=test)
	Token       string // bearer token (set by callers; auth package supplies)
	HTTPClient  *http.Client
	Middleware  []Middleware // outermost first
	ExitOnError bool         // honored by Error middleware (Task 5)
	SilenceAuth bool         // honored by Error middleware (Task 5)
}

// Client composes a transport with middleware. It implements Doer.
type Client struct {
	chain Doer
	cfg   Config
}

func NewClient(cfg Config) *Client {
	if cfg.HTTPClient == nil {
		// NOT http.DefaultClient: its proxy policy is the inverse of Node's
		// (see internal/httpproxy). This client carries the bearer token.
		cfg.HTTPClient = httpproxy.Client()
	}
	base := newTransport(cfg)
	chain := Doer(base)
	for i := len(cfg.Middleware) - 1; i >= 0; i-- {
		chain = cfg.Middleware[i](chain)
	}
	return &Client{chain: chain, cfg: cfg}
}

func (c *Client) Do(req *http.Request) (*http.Response, error) {
	return c.chain.Do(req)
}

// APIHost returns the configured API host. Used by callers (e.g. defensivemode)
// that need to POST directly to /graphql.
func (c *Client) APIHost() string { return c.cfg.APIHost }
