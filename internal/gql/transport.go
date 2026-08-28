package gql

import (
	json "encoding/json/v2"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type transport struct {
	cfg Config
}

func newTransport(cfg Config) Doer { return &transport{cfg: cfg} }

// Do rewrites the request URL to include ?x_query=<operationName> (unless
// TestMode is set, matching the Node behavior in api.ts:127–134). Attaches
// the bearer token if present.
func (t *transport) Do(req *http.Request) (*http.Response, error) {
	if !t.cfg.TestMode {
		if op, err := operationNameFromBody(req); err == nil && op != "" {
			q := req.URL.Query()
			q.Set("x_query", op)
			req.URL.RawQuery = q.Encode()
		}
	}
	if t.cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+t.cfg.Token)
	}
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return t.cfg.HTTPClient.Do(req)
}

// operationNameFromBody peeks the JSON body for "operationName" without
// consuming the reader.
func operationNameFromBody(req *http.Request) (string, error) {
	if req.Body == nil {
		return "", nil
	}
	buf, err := io.ReadAll(req.Body)
	if err != nil {
		return "", err
	}
	req.Body = io.NopCloser(strings.NewReader(string(buf)))
	req.ContentLength = int64(len(buf))
	var doc struct {
		OperationName string `json:"operationName"`
	}
	if err := json.Unmarshal(buf, &doc); err != nil {
		return "", err
	}
	return url.QueryEscape(doc.OperationName), nil
}
