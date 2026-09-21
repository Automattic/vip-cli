package upload

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestUploadDebugSummarizesWithoutFileContentsOrCredentials(t *testing.T) {
	for _, compress := range []bool{false, true} {
		t.Run(map[bool]string{false: "plain", true: "compressed"}[compress], func(t *testing.T) {
			c := stubPresignServer(t, func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				_, _ = w.Write([]byte("RESPONSE_SECRET"))
			})
			c.Token = "TOKEN_SECRET"
			content := []byte("SQL_SECRET")
			if compress {
				content = bytes.Repeat(content, int(CompressThreshold)/len(content)+1)
			}
			meta, err := GetFileMeta(writeTemp(t, "PATH_SECRET.sql", content))
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			res, err := c.UploadImportFile(debuglog.WithLogger(context.Background(), "vip:lib/client-file-uploader", &logs), 1, 2, meta, "md5", nil)
			if err != nil {
				t.Fatal(err)
			}
			if compress {
				defer os.RemoveAll(filepath.Dir(res.Meta.FileName))
			}
			for _, want := range []string{"bytes=", "checksum", "PutObject", "Upload complete"} {
				if !strings.Contains(logs.String(), want) {
					t.Errorf("missing %q in %q", want, logs.String())
				}
			}
			if compress && !strings.Contains(logs.String(), "Compression complete") {
				t.Errorf("missing compression diagnostic: %s", &logs)
			}
			for _, secret := range []string{"SQL_SECRET", "PATH_SECRET", "TOKEN_SECRET", "RESPONSE_SECRET", res.Checksum} {
				if strings.Contains(logs.String(), secret) {
					t.Errorf("leaked %q", secret)
				}
			}
		})
	}
}

func TestMultipartDebugReportsPartCountWithoutUploadIdentifiers(t *testing.T) {
	_, c := newMultipartTest(t)
	meta, err := GetFileMeta(writeTemp(t, "PATH_SECRET.sql", bytes.Repeat([]byte("x"), 40)))
	if err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	_, err = c.uploadUsingMultipart(debuglog.WithLogger(context.Background(), "vip:lib/client-file-uploader", &logs), 1, 2, meta, 16, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(logs.String(), "Multipart") || !strings.Contains(logs.String(), "parts=3") {
		t.Errorf("missing strategy/count: %s", &logs)
	}
	for _, secret := range []string{"UPLOAD123", "etag-", "PATH_SECRET", c.APIHost} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("leaked %q", secret)
		}
	}
}
