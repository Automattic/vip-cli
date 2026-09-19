package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPostLogoutSendsBearer(t *testing.T) {
	var gotAuth, gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotMethod, gotPath = r.Header.Get("Authorization"), r.Method, r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	if err := PostLogout(srv.URL, "rawtok"); err != nil {
		t.Fatalf("PostLogout: %v", err)
	}
	if gotAuth != "Bearer rawtok" || gotMethod != http.MethodPost || gotPath != "/logout" {
		t.Errorf("got %q %q %q", gotMethod, gotPath, gotAuth)
	}
}

func TestPostLogoutIgnoresServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	if err := PostLogout(srv.URL, "tok"); err != nil {
		t.Errorf("5xx should be ignored, got %v", err)
	}
}
