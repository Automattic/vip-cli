package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/Automattic/vip/internal/httpproxy"
)

// PostLogout best-effort invalidates the token server-side (Node logout.ts:
// http('/logout', {method:'post'})). The response status is intentionally
// ignored; only a transport failure returns a non-nil error. The caller always
// purges the local token regardless.
func PostLogout(apiHost, rawToken string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiHost+"/logout", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+rawToken)
	// NOT http.DefaultClient: this request carries the bearer token, and Node
	// routes /logout through api/http.ts's proxy agent. See internal/httpproxy.
	resp, err := httpproxy.Client().Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}
