package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/telemetry"
	"github.com/spf13/cobra"
)

// The Pendo endpoint requires the same bearer as the command API. A payload-only
// test with an always-200 server did not catch the missing authentication.
func TestPendoUsesCommandSession(t *testing.T) {
	for _, mode := range []string{"stored", "bypassed", "login"} {
		t.Run(mode, func(t *testing.T) {
			for _, name := range []string{"DO_NOT_TRACK", "GO_ENV", "NODE_ENV", "VIP_TOKEN_OVERRIDE", "WPVIP_DEPLOY_TOKEN", "VIP_PROXY", "vip_proxy", "VIP_USE_SYSTEM_PROXY"} {
				t.Setenv(name, "")
			}
			raw := validBootstrapRaw(t, 10000)
			accepted, rejected := 0, 0
			pendo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer "+raw {
					rejected++
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				accepted++
			}))
			defer pendo.Close()
			tracker := &telemetry.Tracker{Clients: []telemetry.Client{&telemetry.PendoClient{Endpoint: pendo.URL, UserID: "fixture"}}}
			rec := &gqlOpRecorder{}
			api := rec.server(t, map[string]string{
				"ResolveAppByName":                  resolveAppByNameBody,
				"GetEnvironmentVariablesWithValues": envVarsWithValuesBody,
			})
			defer api.Close()
			t.Setenv("API_HOST", api.URL)
			k := newBootstrapKeychain(&bootstrapBackend{})
			if mode != "login" {
				if err := auth.NewStore(k).Save(raw); err != nil {
					t.Fatal(err)
				}
			}
			variable := "HELP"
			if mode == "bypassed" {
				variable = "help"
			}
			err := runWithDeps([]string{"config", "envvar", "get", variable, "--app", "example", "--env", "develop"}, runDeps{
				Tracker:     tracker,
				NewKeychain: func(string) *keychain.Keychain { return k },
				NewLogin: func(store *auth.Store) func() (*auth.Token, error) {
					return func() (*auth.Token, error) {
						// Login events before saving a token must not issue anonymous requests.
						tracker.TrackEvent("login_command_execute", nil)
						if err := store.Save(raw); err != nil {
							return nil, err
						}
						tracker.AliasUser(10000)
						return parsedBootstrapToken(t, raw), nil
					}
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			if rejected != 0 || accepted < 2 {
				t.Fatalf("Pendo accepted=%d rejected=%d; expected authenticated command events only", accepted, rejected)
			}
		})
	}
}

func TestPendoDebugFlagReachesClient(t *testing.T) {
	for _, name := range []string{"DO_NOT_TRACK", "GO_ENV", "NODE_ENV", "DEBUG"} {
		t.Setenv(name, "")
	}
	var out, diagnostics bytes.Buffer
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }))
	defer srv.Close()
	tr := &telemetry.Tracker{Clients: []telemetry.Client{&telemetry.PendoClient{Endpoint: srv.URL, HTTP: srv.Client(), GetToken: func() (string, error) { return "private-token", nil }}}}
	root := newRootBase(&rootContext{tracker: tr})
	root.SetOut(&out)
	root.SetErr(&diagnostics)
	root.AddCommand(&cobra.Command{Use: "probe", Run: func(cmd *cobra.Command, _ []string) {
		tr.TrackEvent("test", nil)
		fmt.Fprintln(cmd.OutOrStdout(), "ok")
	}})
	root.SetArgs([]string{"probe", "-d"})
	if err := root.Execute(); err != nil {
		t.Fatal(err)
	}
	if out.String() != "ok\n" || !strings.Contains(diagnostics.String(), "401") || strings.Contains(diagnostics.String(), "private-token") {
		t.Fatalf("stdout=%q stderr=%q", out.String(), diagnostics.String())
	}
}

func TestPendoImplicitLoginUsesDebugEnvironment(t *testing.T) {
	for _, name := range []string{"DO_NOT_TRACK", "GO_ENV", "NODE_ENV", "VIP_TOKEN_OVERRIDE", "WPVIP_DEPLOY_TOKEN"} {
		t.Setenv(name, "")
	}
	t.Setenv("DEBUG", "@automattic/vip:analytics:clients:pendo")
	// Like Node, DEBUG is available during bootstrap, before command flag parsing.
	output, err := os.CreateTemp(t.TempDir(), "stderr")
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()
	previous := os.Stderr
	os.Stderr = output
	defer func() { os.Stderr = previous }()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }))
	defer srv.Close()
	tr := &telemetry.Tracker{Clients: []telemetry.Client{&telemetry.PendoClient{Endpoint: srv.URL, HTTP: srv.Client()}}}
	k := newBootstrapKeychain(&bootstrapBackend{})
	err = runWithDeps([]string{"whoami"}, runDeps{
		Tracker: tr, NewKeychain: func(string) *keychain.Keychain { return k },
		NewLogin: func(store *auth.Store) func() (*auth.Token, error) {
			return func() (*auth.Token, error) {
				if err := store.Save("private-token"); err != nil {
					return nil, err
				}
				tr.TrackEvent("login_command_token_submit_success", nil)
				return nil, auth.ErrLoginCancelled // stop before any command API requests
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := output.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	diagnostics, err := io.ReadAll(output)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(diagnostics), "401") || strings.Contains(string(diagnostics), "private-token") {
		t.Fatalf("bootstrap diagnostics=%q", diagnostics)
	}
}
