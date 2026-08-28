package rechallenge

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/httpproxy"
)

// Client speaks the Parker REST protocol. APIHost should NOT include a trailing
// slash; paths supplied to its methods come from extensions.rechallenge and
// already start with "/".
type Client struct {
	APIHost     string
	BearerToken string
	HTTP        *http.Client
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	// A bare &http.Client{} would inherit http.DefaultTransport's proxy
	// policy, which is the inverse of Node's. Step-up requests carry the
	// bearer token and mint an elevated one. See internal/httpproxy.
	return httpproxy.ClientWithTimeout(30 * time.Second)
}

type CreateSessionInput struct {
	Path               string
	RequestedOperation string
}

func (c *Client) CreateSession(in CreateSessionInput) (*Session, error) {
	body, err := json.Marshal(map[string]string{
		"clientType":         ClientType,
		"requestedOperation": in.RequestedOperation,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", c.absoluteURL(in.Path), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", randomUUID())
	if err := c.attachAuthorization(req); err != nil {
		return nil, err
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if !is2xx(resp.StatusCode) {
		return nil, c.httpErrorFromResponse(resp, in.RequestedOperation)
	}
	var s Session
	if err := decodeJSON(resp.Body, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

type GetSessionStatusInput struct {
	Template    string
	ChallengeID string
	Scope       string
}

func (c *Client) GetSessionStatus(in GetSessionStatusInput) (*SessionStatus, error) {
	path := fillTemplate(in.Template, in.ChallengeID)
	req, err := http.NewRequest("GET", c.absoluteURL(path), nil)
	if err != nil {
		return nil, err
	}
	if err := c.attachAuthorization(req); err != nil {
		return nil, err
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if !is2xx(resp.StatusCode) {
		return nil, c.httpErrorFromResponse(resp, in.Scope)
	}
	var ss SessionStatus
	if err := decodeJSON(resp.Body, &ss); err != nil {
		return nil, err
	}
	return &ss, nil
}

type ExchangeInput struct {
	Template    string
	ChallengeID string
	Scope       string
}

func (c *Client) Exchange(in ExchangeInput) (*ExchangeResponse, error) {
	path := fillTemplate(in.Template, in.ChallengeID)
	req, err := http.NewRequest("POST", c.absoluteURL(path), nil)
	if err != nil {
		return nil, err
	}
	if err := c.attachAuthorization(req); err != nil {
		return nil, err
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if !is2xx(resp.StatusCode) {
		return nil, c.httpErrorFromResponse(resp, in.Scope)
	}
	var er ExchangeResponse
	if err := decodeJSON(resp.Body, &er); err != nil {
		return nil, err
	}
	return &er, nil
}

func (c *Client) attachAuthorization(req *http.Request) error {
	if c.BearerToken == "" {
		return nil
	}
	apiURL, err := url.Parse(c.APIHost)
	if err != nil {
		return fmt.Errorf("parse rechallenge API host: %w", err)
	}
	if !strings.EqualFold(req.URL.Scheme, apiURL.Scheme) || !strings.EqualFold(req.URL.Host, apiURL.Host) {
		return fmt.Errorf("refusing cross-origin rechallenge request to %s://%s", req.URL.Scheme, req.URL.Host)
	}
	req.Header.Set("Authorization", "Bearer "+c.BearerToken)
	return nil
}

// absoluteURL combines APIHost with the path UNLESS the path is already absolute.
// Parker templates may be returned as relative paths or full URLs. Authenticated
// requests accept full URLs only when attachAuthorization confirms they are on
// the same origin as APIHost.
func (c *Client) absoluteURL(path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	return c.APIHost + path
}

func fillTemplate(template, challengeID string) string {
	return strings.ReplaceAll(template, "{challengeId}", url.PathEscape(challengeID))
}

func is2xx(code int) bool { return code >= 200 && code < 300 }

// httpErrorFromResponse turns a non-2xx Parker response into an error carrying
// the server's own text — that text is the whole diagnosis when step-up fails.
//
// It is redacted at birth rather than at the point of display: the error is
// surfaced to the user, written to CI logs, and shipped to telemetry by
// main.go's exit hook, and Parker echoes request context (including the
// Authorization header we just sent) into some error payloads. Redacting here
// means no future consumer has to remember to.
func (c *Client) httpErrorFromResponse(resp *http.Response, scope string) error {
	body, _ := io.ReadAll(resp.Body)
	return NewHttpError(resp.StatusCode, RedactSecrets(string(body), c.BearerToken), scope)
}

func decodeJSON(r io.Reader, v any) error {
	body, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}

func randomUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	// RFC 4122 v4 layout: set version + variant nibbles.
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}
