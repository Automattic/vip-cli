package update

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestDownloadReportsCauseWithoutRedirectURL(t *testing.T) {
	cause := &net.DNSError{Err: "no such host", Name: "release-assets.githubusercontent.com", IsNotFound: true}
	d := Downloader{Client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host == "github.com" {
			return &http.Response{StatusCode: http.StatusFound, Header: http.Header{"Location": {"https://release-assets.githubusercontent.com/archive?sig=secret"}}, Body: http.NoBody}, nil
		}
		return nil, cause
	})}}
	_, err := d.fetch(context.Background(), Asset{Name: "release.tar.gz", URL: "https://github.com/Automattic/vip-cli/releases/download/5.0.1/release.tar.gz"}, 1024)
	if err == nil || !strings.Contains(err.Error(), "no such host") || !errors.Is(err, cause) {
		t.Fatalf("network cause lost: %v", err)
	}
	if strings.Contains(err.Error(), "sig=") || strings.Contains(err.Error(), "secret") {
		t.Fatalf("redirect credentials leaked: %v", err)
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		t.Fatalf("redirect URL retained in error chain: %v", err)
	}
}
