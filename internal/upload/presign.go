package upload

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/httpproxy"
)

// Client issues presigned-request lookups against the VIP API and the
// resulting S3 uploads. APIHost/Token come from commands.GetConfig();
// HTTPClient defaults to httpproxy.Client().
type Client struct {
	APIHost    string
	Token      string
	HTTPClient *http.Client
	// retryDelay overrides the backoff in tests. nil = Node's
	// 2^attempt * 1s (fetch-retry config, client-file-uploader.ts:24).
	retryDelay func(attempt int) time.Duration
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	// NOT http.DefaultClient: the presign call carries the bearer token (or
	// WPVIP_DEPLOY_TOKEN) and the S3 PUTs carry a presigned URL whose query
	// string is itself the credential. See internal/httpproxy.
	return httpproxy.Client()
}

// SignedRequestArgs ports GetSignedUploadRequestDataArgs
// (client-file-uploader.ts:56). EtagResults is the multipart completion
// payload: a list of {"ETag": ..., "PartNumber": ...} objects.
type SignedRequestArgs struct {
	Action      string           `json:"action"`
	AppID       int64            `json:"appId"`
	EnvID       int64            `json:"envId"`
	BaseName    string           `json:"basename"`
	EtagResults []map[string]any `json:"etagResults,omitempty"`
	PartNumber  int              `json:"partNumber,omitempty"`
	UploadID    string           `json:"uploadId,omitempty"`
}

// PresignedRequest mirrors Node's PresignedRequest
// (client-file-uploader.ts:236).
type PresignedRequest struct {
	URL     string `json:"url"`
	Options struct {
		Method  string            `json:"method"`
		Headers map[string]string `json:"headers"`
		Body    string            `json:"body,omitempty"`
	} `json:"options"`
}

// GetSignedUploadRequestData ports getSignedUploadRequestData
// (client-file-uploader.ts:411): POST /upload/site-import-presigned-url
// with the CLI token, or WPVIP_DEPLOY_TOKEN when set (ts:420 — the
// deploy-token bypass skips the keychain credential entirely).
func (c *Client) GetSignedUploadRequestData(ctx context.Context, args SignedRequestArgs) (*PresignedRequest, error) {
	body, err := json.Marshal(args)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.APIHost+"/upload/site-import-presigned-url", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	token := c.Token
	if t := os.Getenv("WPVIP_DEPLOY_TOKEN"); t != "" {
		token = t
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// Node: throw new Error((await response.text()) || statusText)
		// — client-file-uploader.ts:433.
		text, _ := io.ReadAll(resp.Body)
		if len(text) > 0 {
			return nil, fmt.Errorf("%s", text)
		}
		return nil, fmt.Errorf("%s", resp.Status)
	}
	var pr PresignedRequest
	if err := json.UnmarshalRead(resp.Body, &pr); err != nil {
		return nil, err
	}
	return &pr, nil
}
