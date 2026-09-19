package gql

import "net/http"

// HTTPClientWithMiddleware returns an *http.Client whose RoundTripper composes
// the supplied middleware chain via the *Client's Do method. Use this to feed
// the same chain (error -> rechallenge -> retry) to a genqlient graphql.Client
// without duplicating the wiring.
//
// The returned *http.Client and the underlying *Client share the same
// transport.HTTPClient (http.DefaultClient by default), so any rechallenge
// retry stays on the same connection pool.
func HTTPClientWithMiddleware(apiHost, token string, mw []Middleware) *http.Client {
	client := NewClient(Config{APIHost: apiHost, Token: token, Middleware: mw})
	return &http.Client{Transport: &doerTransport{c: client}}
}

// doerTransport adapts a *Client (which exposes Do) to net/http.RoundTripper
// so genqlient's graphql.Client can run through our middleware stack.
type doerTransport struct{ c *Client }

func (d *doerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return d.c.Do(req)
}
