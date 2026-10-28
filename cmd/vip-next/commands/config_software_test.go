package commands

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/output"
)

// softwareSettingsBody builds a SoftwareSettings GraphQL JSON response for a
// WordPress environment (typeId 2) with WordPress and PHP populated.
const softwareSettingsBody = `{"data":{"app":{"id":1,"name":"testapp","typeId":2,"environments":[{"id":2,"appId":1,"type":"develop","name":"develop","softwareSettings":{"wordpress":{"name":"WordPress","slug":"wordpress","pinned":false,"current":{"version":"6.4","default":true,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false},"options":[{"version":"6.3","default":false,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false},{"version":"6.4","default":true,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"6.4","private":false}]},"php":{"name":"PHP","slug":"php","pinned":true,"current":{"version":"8.2","default":true,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"8.2","private":false},"options":[{"version":"8.1","default":false,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"8.2","private":false},{"version":"8.2","default":true,"deprecated":false,"unstable":false,"compatible":true,"latestRelease":"8.2","private":false}]},"muplugins":null,"nodejs":null}}]}}}`

// softwareSettingsNullBody returns a response where softwareSettings is null
// (environment does not support it).
const softwareSettingsNullBody = `{"data":{"app":{"id":1,"name":"testapp","typeId":2,"environments":[{"id":2,"appId":1,"type":"develop","name":"develop","softwareSettings":null}]}}}`

func setupSoftwareConfig(srv *httptest.Server) {
	c := graphql.NewClient(srv.URL+"/graphql", srv.Client())
	SetConfig(Config{GQLClient: c})
}

func softwareStubServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.ReadAll(r.Body) // drain
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestConfigSoftwareGetAllComponents(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	srv := softwareStubServer(t, softwareSettingsBody)
	setupSoftwareConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runConfigSoftwareGet(cmd, nil)
	if err != nil {
		t.Fatalf("runConfigSoftwareGet: %v", err)
	}
	rows, ok := data.(output.OrderedRows)
	if !ok {
		t.Fatalf("data type = %T, want OrderedRows", data)
	}
	// wordpress + php should be present (muplugins and nodejs are null)
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	// First column of first row should be name = WordPress
	found := false
	for _, row := range rows {
		for _, col := range row {
			if col.Key == "name" && col.Value.(string) == "WordPress" {
				found = true
			}
		}
	}
	if !found {
		t.Errorf("expected WordPress row in output; got %+v", rows)
	}
	// PHP row
	found = false
	for _, row := range rows {
		for _, col := range row {
			if col.Key == "name" && col.Value.(string) == "PHP" {
				found = true
			}
		}
	}
	if !found {
		t.Errorf("expected PHP row in output; got %+v", rows)
	}
}

func TestConfigSoftwareGetSingleComponent(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	srv := softwareStubServer(t, softwareSettingsBody)
	setupSoftwareConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))

	data, err := runConfigSoftwareGet(cmd, []string{"wordpress"})
	if err != nil {
		t.Fatalf("runConfigSoftwareGet(wordpress): %v", err)
	}
	rows, ok := data.(output.OrderedRows)
	if !ok {
		t.Fatalf("data type = %T, want OrderedRows", data)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if rows[0][0].Value.(string) != "WordPress" {
		t.Errorf("row[0].name = %v, want WordPress", rows[0][0].Value)
	}
}

func TestConfigSoftwareGetInvalidInclude(t *testing.T) {
	srv := softwareStubServer(t, softwareSettingsBody)
	setupSoftwareConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareGetCmd()
	_ = cmd.Flags().Set("include", "bogus")
	cmd.SetContext(ctxWithAppEnv(1, 2))

	_, err := runConfigSoftwareGet(cmd, nil)
	if err == nil {
		t.Fatal("expected error for invalid include, got nil")
	}
	if !strings.Contains(err.Error(), "Invalid include value(s): bogus") {
		t.Errorf("err = %q, want 'Invalid include value(s): bogus'", err.Error())
	}
}

func TestConfigSoftwareGetNullSettings(t *testing.T) {
	srv := softwareStubServer(t, softwareSettingsNullBody)
	setupSoftwareConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))

	_, err := runConfigSoftwareGet(cmd, nil)
	if err == nil {
		t.Fatal("expected error for null softwareSettings, got nil")
	}
	if err.Error() != "Software settings are not supported for this environment." {
		t.Errorf("err = %q, want Node-parity message", err.Error())
	}
}

func TestConfigSoftwareGetPhpShowsRunningVersion(t *testing.T) {
	var runningVersionRequests int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(string(body), `"operationName":"SoftwareRunningPhpVersion"`) {
			runningVersionRequests++
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[{"softwareSettings":{"php":{"runningVersion":"8.2.35"}}}]}}}`))
			return
		}
		_, _ = w.Write([]byte(softwareSettingsBody))
	}))
	t.Cleanup(srv.Close)
	setupSoftwareConfig(srv)
	defer SetConfig(Config{})

	versionOf := func(rows output.OrderedRows, name string) any {
		for _, row := range rows {
			if row[0].Value == name {
				return row[2].Value
			}
		}
		return nil
	}

	cmd := ConfigSoftwareGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))
	data, err := runConfigSoftwareGet(cmd, []string{"php"})
	if err != nil {
		t.Fatalf("runConfigSoftwareGet(php): %v", err)
	}
	if got := versionOf(data.(output.OrderedRows), "PHP"); got != "8.2.35" {
		t.Errorf("php version = %v, want 8.2.35", got)
	}

	// Without the php argument, the running version isn't requested.
	cmd = ConfigSoftwareGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))
	data, err = runConfigSoftwareGet(cmd, nil)
	if err != nil {
		t.Fatalf("runConfigSoftwareGet: %v", err)
	}
	if got := versionOf(data.(output.OrderedRows), "PHP"); got != "8.2" {
		t.Errorf("php version = %v, want 8.2", got)
	}
	if runningVersionRequests != 1 {
		t.Errorf("SoftwareRunningPhpVersion requests = %d, want 1", runningVersionRequests)
	}
}

func TestConfigSoftwareGetUnknownComponent(t *testing.T) {
	srv := softwareStubServer(t, softwareSettingsBody)
	setupSoftwareConfig(srv)
	defer SetConfig(Config{})

	cmd := ConfigSoftwareGetCmd()
	cmd.SetContext(ctxWithAppEnv(1, 2))

	_, err := runConfigSoftwareGet(cmd, []string{"redis"})
	if err == nil {
		t.Fatal("expected error for unsupported component, got nil")
	}
	if err.Error() != "Software settings for redis are not supported for this environment." {
		t.Errorf("err = %q, want Node-parity message", err.Error())
	}
}
