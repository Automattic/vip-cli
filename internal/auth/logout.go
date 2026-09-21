package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/httpproxy"
)

// PostLogout best-effort invalidates the token server-side (Node logout.ts:
// http('/logout', {method:'post'})). The response status is intentionally
// ignored; only a transport failure returns a non-nil error. The caller always
// purges the local token regardless.
func PostLogout(apiHost, rawToken string) error {
	return PostLogoutContext(context.Background(), apiHost, rawToken)
}

// PostLogoutContext preserves invocation diagnostics and cancellation while
// retaining the bounded, best-effort server-side invalidation behavior.
func PostLogoutContext(ctx context.Context, apiHost, rawToken string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiHost+"/logout", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+rawToken)
	// Node's HTTP helper logs the request target. Only expose the fixed logout
	// path and target host; URL userinfo, queries and headers may carry secrets.
	debuglog.Printf(ctx, "@automattic/vip:http", "running fetch %s://%s/logout", req.URL.Scheme, req.URL.Host)
	// NOT http.DefaultClient: this request carries the bearer token, and Node
	// routes /logout through api/http.ts's proxy agent. See internal/httpproxy.
	resp, err := httpproxy.Client().Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}
