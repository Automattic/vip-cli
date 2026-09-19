package upload

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	json "encoding/json/v2"
)

// multipartStub implements presign + CreateMultipartUpload + UploadPart +
// CompleteMultipartUpload endpoints.
type multipartStub struct {
	t            *testing.T
	mu           sync.Mutex
	parts        map[int][]byte
	maxInFlight  int32
	inFlight     int32
	failPart2    int32 // fail part #2 this many times (network-level close)
	complete     []byte
	completeBody []byte
}

const signedCompleteMultipartBody = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Part><ETag>etag-1</ETag><PartNumber>1</PartNumber></Part><Part><ETag>etag-2</ETag><PartNumber>2</PartNumber></Part><Part><ETag>etag-3</ETag><PartNumber>3</PartNumber></Part></CompleteMultipartUpload>`

func newMultipartTest(t *testing.T) (*multipartStub, *Client) {
	st := &multipartStub{t: t, parts: map[int][]byte{}}
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	mux.HandleFunc("/upload/site-import-presigned-url", func(w http.ResponseWriter, r *http.Request) {
		var args SignedRequestArgs
		b, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(b, &args); err != nil {
			st.t.Errorf("bad presign body: %v", err)
		}
		switch args.Action {
		case "CreateMultipartUpload":
			fmt.Fprintf(w, `{"url":"%s/s3create","options":{"method":"POST","headers":{}}}`, srv.URL)
		case "UploadPart":
			fmt.Fprintf(w, `{"url":"%s/s3part/%d","options":{"method":"PUT","headers":{}}}`, srv.URL, args.PartNumber)
		case "CompleteMultipartUpload":
			st.mu.Lock()
			st.complete = b
			st.mu.Unlock()
			fmt.Fprintf(w, `{"url":"%s/s3complete","options":{"method":"POST","headers":{"Content-Length":"%d","Content-Type":"application/xml"},"body":%q}}`, srv.URL, len(signedCompleteMultipartBody), signedCompleteMultipartBody)
		default:
			st.t.Errorf("unexpected action %q", args.Action)
		}
	})
	mux.HandleFunc("/s3create", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<?xml version="1.0"?><InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>UPLOAD123</UploadId></InitiateMultipartUploadResult>`))
	})
	mux.HandleFunc("/s3part/", func(w http.ResponseWriter, r *http.Request) {
		cur := atomic.AddInt32(&st.inFlight, 1)
		defer atomic.AddInt32(&st.inFlight, -1)
		for {
			max := atomic.LoadInt32(&st.maxInFlight)
			if cur <= max || atomic.CompareAndSwapInt32(&st.maxInFlight, max, cur) {
				break
			}
		}
		var n int
		_, _ = fmt.Sscanf(r.URL.Path, "/s3part/%d", &n)
		if n == 2 && atomic.AddInt32(&st.failPart2, -1) >= 0 {
			// network-level failure: hijack + close so the client sees a
			// transport error (the only thing fetch-retry retries).
			hj, ok := w.(http.Hijacker)
			if !ok {
				st.t.Fatal("hijack unsupported")
			}
			conn, _, err := hj.Hijack()
			if err != nil {
				st.t.Fatal(err)
			}
			conn.Close()
			return
		}
		body, _ := io.ReadAll(r.Body)
		st.mu.Lock()
		st.parts[n] = body
		st.mu.Unlock()
		w.Header().Set("ETag", fmt.Sprintf(`"etag-%d"`, n))
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/s3complete", func(w http.ResponseWriter, r *http.Request) {
		st.mu.Lock()
		st.completeBody, _ = io.ReadAll(r.Body)
		st.mu.Unlock()
		_, _ = w.Write([]byte(`<?xml version="1.0"?><CompleteMultipartUploadResult><Location>l</Location><Bucket>b</Bucket><Key>k</Key><ETag>"final"</ETag></CompleteMultipartUploadResult>`))
	})
	return st, &Client{APIHost: srv.URL, Token: "tok", HTTPClient: srv.Client(),
		retryDelay: func(int) time.Duration { return 0 }}
}

func TestMultipartHappyPath(t *testing.T) {
	st, c := newMultipartTest(t)
	content := bytes.Repeat([]byte("x"), 40) // partSize 16 → 3 parts: 16,16,8
	p := filepath.Join(t.TempDir(), "big.sql")
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	meta, _ := GetFileMeta(p)
	if _, err := c.uploadUsingMultipart(context.Background(), 1, 2, meta, 16, nil); err != nil {
		t.Fatal(err)
	}
	if len(st.parts[1]) != 16 || len(st.parts[2]) != 16 || len(st.parts[3]) != 8 {
		t.Errorf("part sizes: %d/%d/%d", len(st.parts[1]), len(st.parts[2]), len(st.parts[3]))
	}
	comp := string(st.complete)
	if !strings.Contains(comp, `"ETag":"etag-1"`) || !strings.Contains(comp, `"PartNumber":3`) {
		t.Errorf("complete body = %s", comp)
	}
	if got := string(st.completeBody); got != signedCompleteMultipartBody {
		t.Errorf("S3 completion body = %q, want signed body %q", got, signedCompleteMultipartBody)
	}
}

func TestMultipartPartRetrySucceeds(t *testing.T) {
	st, c := newMultipartTest(t)
	atomic.StoreInt32(&st.failPart2, 2) // fail part 2 twice, succeed third
	content := bytes.Repeat([]byte("y"), 40)
	p := filepath.Join(t.TempDir(), "big.sql")
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	meta, _ := GetFileMeta(p)
	if _, err := c.uploadUsingMultipart(context.Background(), 1, 2, meta, 16, nil); err != nil {
		t.Fatal(err)
	}
	if len(st.parts[2]) != 16 {
		t.Errorf("part 2 not uploaded after retries")
	}
}

func TestMultipartPartRetryExhausts(t *testing.T) {
	st, c := newMultipartTest(t)
	atomic.StoreInt32(&st.failPart2, 99) // never recovers
	content := bytes.Repeat([]byte("y"), 40)
	p := filepath.Join(t.TempDir(), "big.sql")
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	meta, _ := GetFileMeta(p)
	if _, err := c.uploadUsingMultipart(context.Background(), 1, 2, meta, 16, nil); err == nil {
		t.Fatal("want error after retry exhaustion")
	}
}

func TestMultipartConcurrencyCap(t *testing.T) {
	st, c := newMultipartTest(t)
	content := bytes.Repeat([]byte("z"), 16*12) // 12 parts
	p := filepath.Join(t.TempDir(), "big.sql")
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	meta, _ := GetFileMeta(p)
	if _, err := c.uploadUsingMultipart(context.Background(), 1, 2, meta, 16, nil); err != nil {
		t.Fatal(err)
	}
	if got := atomic.LoadInt32(&st.maxInFlight); got > MaxConcurrentPartUploads {
		t.Errorf("max in-flight = %d, want <= %d", got, MaxConcurrentPartUploads)
	}
}

func TestUploadImportFileGzRename(t *testing.T) {
	for in, want := range map[string]string{
		"dump.sql":    "dump.sql.gz",
		"dump.sql.gz": "dump.sql.gz",
		"DUMP.SQL.GZ": "DUMP.SQL.gz",
	} {
		if got := gzRename(in); got != want {
			t.Errorf("gzRename(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUploadImportFileSmallUsesPutObject(t *testing.T) {
	var sawPut bool
	c := stubPresignServer(t, func(w http.ResponseWriter, r *http.Request) {
		sawPut = true
		w.WriteHeader(http.StatusOK)
	})
	p := writeTemp(t, "dump.sql", []byte("SELECT 1;\n"))
	meta, _ := GetFileMeta(p)
	res, err := c.UploadImportFile(context.Background(), 1, 2, meta, "md5", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !sawPut {
		t.Error("small file must take the PutObject path")
	}
	if res.Meta.BaseName != "dump.sql" || res.Meta.IsCompressed {
		t.Errorf("meta = %+v (small file must not be compressed)", res.Meta)
	}
	if len(res.Checksum) != 32 {
		t.Errorf("checksum = %q", res.Checksum)
	}
}
