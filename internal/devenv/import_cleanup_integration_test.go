//go:build parity && import_cleanup_integration

package devenv

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/parity"
)

// Opt-in differential test using the actual Node/Go sanitizers and mysql client.
// Supply a disposable container named vip-import-cleanup-test-*; ordinary unit
// tests never access Docker. See docs/DEV-ENV-IMPORT-CLEANUP.md.
type cleanupDatabaseRunner struct {
	fakeImportRunner
	container string
}

func (r *cleanupDatabaseRunner) ComposeStdin(ctx context.Context, _ string, body io.Reader, _ ...string) error {
	cmd := exec.CommandContext(ctx, "docker", "exec", "-i", r.container, "mysql", "-uwordpress", "-pwordpress", "-Dwordpress")
	cmd.Stdin = body
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("mysql failed: %s", output)
	}
	return nil
}
func (r *cleanupDatabaseRunner) Compose(ctx context.Context, _ string, args ...string) error {
	network := os.Getenv("VIP_IMPORT_CLEANUP_TEST_NETWORK")
	if os.Getenv("VIP_IMPORT_CLEANUP_TEST_CACHE_DOWN") == "1" {
		network = "none"
	}
	cmd := exec.CommandContext(ctx, "docker", "run", "--rm", "--network", network, "--entrypoint", "php", "ghcr.io/automattic/vip-container-images/wp-test-runner:latest", "-r", args[len(args)-1])
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("cache invalidation: %s", output)
	}
	return nil
}
func cleanupCacheQuery(t *testing.T, script string) string {
	t.Helper()
	cmd := exec.Command("docker", "run", "--rm", "--network", os.Getenv("VIP_IMPORT_CLEANUP_TEST_NETWORK"), "--entrypoint", "php", "ghcr.io/automattic/vip-container-images/wp-test-runner:latest", "-r", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("cache fixture: %v %s", err, output)
	}
	return string(output)
}
func cleanupDatabaseQuery(t *testing.T, container, sql string) string {
	t.Helper()
	cmd := exec.Command("docker", "exec", "-i", container, "mysql", "-uroot", "-pwordpress", "-Dwordpress", "-N", "--batch")
	cmd.Stdin = strings.NewReader(sql)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("SQL fixture: %v: %s", err, output)
	}
	// mysql emits its password warning on stderr; query assertions need stdout.
	return strings.ReplaceAll(string(output), "mysql: [Warning] Using a password on the command line interface can be insecure.\n", "")
}
func TestImportCredentialCleanupRealRuntimeParity(t *testing.T) {
	container := os.Getenv("VIP_IMPORT_CLEANUP_TEST_CONTAINER")
	if container == "" {
		t.Skip("requires task-owned disposable MySQL/MariaDB container")
	}
	if !strings.HasPrefix(container, "vip-import-cleanup-test-") {
		t.Fatal("container must be named vip-import-cleanup-test-* and disposable")
	}
	if os.Getenv("VIP_IMPORT_CLEANUP_TEST_NETWORK") == "" {
		t.Fatal("requires disposable cache network VIP_IMPORT_CLEANUP_TEST_NETWORK")
	}
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "dist/lib/dev-environment/dev-environment-database.js")); err != nil {
		t.Fatal("build Node with npm run build first")
	}
	fixtureBytes, err := os.ReadFile(filepath.Join(root, "testdata/parity/devenv_import_credentials.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Tables []string `json:"tables"`
		Remove []string `json:"remove"`
		Keep   []string `json:"keep"`
	}
	if err := json.Unmarshal(fixtureBytes, &fixture); err != nil {
		t.Fatal(err)
	}
	nodeScript := `const cp = require('node:child_process');
const core = require('./dist/lib/dev-environment/dev-environment-core');
const lando = require('./dist/lib/dev-environment/dev-environment-lando');
lando.landoShell = async (_lando,_path,_service,_user,args) => { cp.execFileSync('docker',['run','--rm','--network',process.env.VIP_IMPORT_CLEANUP_TEST_CACHE_DOWN === '1' ? 'none' : process.env.VIP_IMPORT_CLEANUP_TEST_NETWORK,'--entrypoint','php','ghcr.io/automattic/vip-container-images/wp-test-runner:latest','-r',args[2]],{stdio:['ignore','pipe','pipe']}); };
core.exec = async (_lando,_slug,args) => { cp.execFileSync('docker',['exec',process.env.VIP_IMPORT_CLEANUP_TEST_CONTAINER,'mysql','-uwordpress','-pwordpress','-Dwordpress','--execute',args[2]],{stdio:['ignore','pipe','pipe']}); };
require('./dist/lib/dev-environment/dev-environment-database').sanitizeImportedCredentials({tasks:[{command:'ssh'}]},'test').then(()=>process.stdout.write('ok')).catch(error=>{process.stdout.write(error.message);process.exitCode=1});`
	for _, mode := range []string{"success", "sql-failure", "cache-failure"} {
		failure := mode == "sql-failure"
		for _, runtime := range []string{"Node", "Go"} {
			t.Run(fmt.Sprintf("%s/%s", runtime, mode), func(t *testing.T) {
				t.Setenv("VIP_IMPORT_CLEANUP_TEST_CACHE_DOWN", map[bool]string{false: "0", true: "1"}[mode == "cache-failure"])
				var setup strings.Builder
				for _, table := range fixture.Tables {
					quoted := "`" + strings.ReplaceAll(table, "`", "``") + "`"
					fmt.Fprintf(&setup, "DROP TABLE IF EXISTS %s; CREATE TABLE %s (option_id BIGINT PRIMARY KEY AUTO_INCREMENT, option_name VARCHAR(191), option_value TEXT, autoload VARCHAR(20)) ENGINE=InnoDB;\n", quoted, quoted)
					for _, name := range append(append([]string{}, fixture.Remove...), fixture.Keep...) {
						fmt.Fprintf(&setup, "INSERT INTO %s (option_name,option_value,autoload) VALUES ('%s','test-sentinel','yes');\n", quoted, name)
					}
				}
				if failure {
					setup.WriteString("CREATE TRIGGER vip_import_cleanup_fail BEFORE DELETE ON vip_import_test_z_options FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected cleanup failure';\n")
				}
				cleanupDatabaseQuery(t, container, setup.String())
				cleanupCacheQuery(t, `$s=fsockopen('memcached',11211); fwrite($s,"set site-options 0 0 13\r\ntest-sentinel\r\nset subsite-options 0 0 13\r\ntest-sentinel\r\n"); for($i=0;$i<2;$i++){ if(trim(fgets($s))!=='STORED'){exit(1);} } fclose($s);`)
				var sanitizeError error
				if runtime == "Go" {
					sanitizeError = sanitizeImportedCredentials(context.Background(), &cleanupDatabaseRunner{container: container}, "test")
				} else {
					cmd := exec.Command("node", "-e", nodeScript)
					cmd.Dir = root
					cmd.Env = parity.FixtureEnv(map[string]string{
						"VIP_IMPORT_CLEANUP_TEST_CONTAINER":  container,
						"VIP_IMPORT_CLEANUP_TEST_NETWORK":    os.Getenv("VIP_IMPORT_CLEANUP_TEST_NETWORK"),
						"VIP_IMPORT_CLEANUP_TEST_CACHE_DOWN": os.Getenv("VIP_IMPORT_CLEANUP_TEST_CACHE_DOWN"),
						"XDG_DATA_HOME":                      t.TempDir(),
						"XDG_CONFIG_HOME":                    t.TempDir(),
					})
					output, err := cmd.CombinedOutput()
					if err != nil {
						sanitizeError = fmt.Errorf("%s", output)
					}
				}
				if (mode != "success") != (sanitizeError != nil) {
					t.Fatalf("sanitation error = %v", sanitizeError)
				}
				if mode != "success" && !strings.Contains(sanitizeError.Error(), "credential cleanup failed") {
					t.Fatal(sanitizeError)
				}
				cached := cleanupCacheQuery(t, `$s=fsockopen('memcached',11211); fwrite($s,"get site-options subsite-options\r\n"); while(($line=fgets($s))!==false){echo $line;if(trim($line)==='END'){break;}} fclose($s);`)
				if (mode != "success") != strings.Contains(cached, "test-sentinel") {
					t.Fatalf("cache after sanitation: %q", cached)
				}
				for _, table := range fixture.Tables {
					quoted := "`" + strings.ReplaceAll(table, "`", "``") + "`"
					count := len(fixture.Keep)
					if failure {
						count += len(fixture.Remove)
					}
					got := strings.TrimSpace(cleanupDatabaseQuery(t, container, "SELECT COUNT(*) FROM "+quoted+";"))
					if got != fmt.Sprint(count) {
						t.Fatalf("%s count = %s, want %d", table, got, count)
					}
					for _, name := range fixture.Keep {
						got := strings.TrimSpace(cleanupDatabaseQuery(t, container, fmt.Sprintf("SELECT option_value FROM %s WHERE option_name='%s';", quoted, name)))
						if got != "test-sentinel" {
							t.Fatalf("unrelated %s changed: %q", name, got)
						}
					}
				}
				if mode == "success" {
					// A second run with no credentials must also succeed.
					if err := sanitizeImportedCredentials(context.Background(), &cleanupDatabaseRunner{container: container}, "test"); err != nil {
						t.Fatal(err)
					}
				}
				got := strings.TrimSpace(cleanupDatabaseQuery(t, container, "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema=DATABASE() AND routine_name='vip_local_import_sanitize';"))
				if got != "0" {
					t.Fatalf("temporary routine left behind: %s", got)
				}
			})
		}
	}
}
