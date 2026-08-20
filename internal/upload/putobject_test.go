package upload

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// stubPresignServer serves both the presign endpoint and the "S3" target.
func stubPresignServer(t *testing.T, s3Handler http.HandlerFunc) *Client {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	mux.HandleFunc("/upload/site-import-presigned-url", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"url":"` + srv.URL + `/s3target","options":{"method":"PUT","headers":{}}}`))
	})
	mux.HandleFunc("/s3target", s3Handler)
	return &Client{APIHost: srv.URL, Token: "tok", HTTPClient: srv.Client()}
}

func TestUploadUsingPutObjectOK(t *testing.T) {
	var gotLen string
	var gotBody []byte
	c := stubPresignServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotLen = r.Header.Get("Content-Length")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	})
	p := writeTemp(t, "small.sql", []byte("SELECT 1;\n"))
	meta, _ := GetFileMeta(p)
	var lastPct string
	result, err := c.uploadUsingPutObject(context.Background(), 1, 2, meta,
		func(pct string) { lastPct = pct })
	if err != nil {
		t.Fatal(err)
	}
	if result != "ok" {
		t.Errorf("result = %q", result)
	}
	if gotLen != "10" || string(gotBody) != "SELECT 1;\n" {
		t.Errorf("len=%q body=%q", gotLen, gotBody)
	}
	if lastPct != "100%" {
		t.Errorf("last pct = %q", lastPct)
	}
}

func TestUploadUsingPutObjectS3Error(t *testing.T) {
	c := stubPresignServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>Denied</Message></Error>`))
	})
	p := writeTemp(t, "small.sql", []byte("SELECT 1;\n"))
	meta, _ := GetFileMeta(p)
	_, err := c.uploadUsingPutObject(context.Background(), 1, 2, meta, nil)
	want := `Unable to upload to cloud storage. {"Code":"AccessDenied","Message":"Denied"}`
	if err == nil || err.Error() != want {
		t.Errorf("err = %v\nwant %s", err, want)
	}
}

func TestUploadUsingPutObjectNonXMLError(t *testing.T) {
	c := stubPresignServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream had a bad day"))
	})
	p := writeTemp(t, "small.sql", []byte("SELECT 1;\n"))
	meta, _ := GetFileMeta(p)
	_, err := c.uploadUsingPutObject(context.Background(), 1, 2, meta, nil)
	// Node falls back to {Code: "HTTP Error <status>", Message: statusText}
	// when the body isn't an <Error> doc (ts:315-320).
	if err == nil || !strings.Contains(err.Error(), "HTTP Error 502") {
		t.Errorf("err = %v", err)
	}
}
