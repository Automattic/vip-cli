package devenv

import (
	"path/filepath"
	"sort"

	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/paths"
)

// dev-env env vars live in <envdir>/.env — the same file, in the same format,
// that the Node CLI uses.
//
// DECISION (cutover-visible; see the parity review's blocker B3). vip-next used
// to keep these in instance_data.json while Node kept them in .env, so a
// variable set with one CLI was silently invisible to the other. Of the two
// ways out — Go adopts .env, or Go migrates .env into instance_data.json — the
// evidence points one way:
//
//   - .env is not merely Node's storage, it is the delivery mechanism on BOTH
//     sides: Node's Lando template declares `env_file: - .env`
//     (assets/dev-env.lando.template.yml.ejs:2) and Go's php service already
//     declares the same (compose/services.go). A variable in .env reaches the
//     container under either CLI with no further plumbing.
//   - Both CLIs already resolve the same directory (paths.EnvironmentPath is
//     byte-identical to Node's getEnvironmentPath), so this is a shared file by
//     construction, not by coincidence.
//   - Node reads ONLY .env (env-vars.ts:69) and has never read
//     instance_data.json. Migrating in the other direction would leave .env a
//     file Node still honours and Go ignores — i.e. the same silent divergence,
//     just reversed.
//
// MIGRATION SEMANTICS. Variables previously written by vip-next into
// instance_data.json are copied into .env on the first envvar read or write,
// then cleared from instance_data.json. Details:
//
//   - .env wins on conflict. It is the shared, current source of truth, and a
//     stale instance_data.json value must never overwrite one the user just set
//     with either CLI.
//   - Clearing is what makes deletes stick: a leftover legacy map would
//     resurrect a variable the user had deleted on the next migration pass.
//   - The migration is one-way but does NOT strand anyone. Node never read
//     instance_data.json, so nothing it relies on is removed; it gains the
//     variables it previously could not see. An older vip-next still consumes
//     .env through the php service's env_file, so a downgrade keeps working —
//     though an older build's Materialize would overwrite .env on the next
//     start, which is the very bug this change removes.
//   - LANDO_HOST_USER_ID / LANDO_HOST_GROUP_ID are vip-next-managed, not user
//     variables: they are written by Materialize (docker compose substitutes
//     ${LANDO_HOST_USER_ID} from .env) and are filtered out of get/list/get-all.

// envFilePath returns <envdir>/.env for a slug.
func envFilePath(slug string) string {
	return filepath.Join(paths.EnvironmentPath(slug), ".env")
}

// loadEnvFile returns the raw .env contents for an env, first folding in any
// variables left behind in instance_data.json by an older vip-next. Reading
// instance data first also preserves the previous "environment not found"
// error for a slug that does not exist.
func loadEnvFile(slug string) (string, error) {
	d, err := instancedata.Read(slug)
	if err != nil {
		return "", err
	}
	raw, err := readEnvFileRaw(paths.EnvironmentPath(slug))
	if err != nil {
		return "", err
	}
	if len(d.EnvVars) == 0 {
		return raw, nil
	}

	// Legacy vars from instance_data.json: add only those .env does not already
	// define, then clear the legacy map so a deleted variable cannot come back.
	present := parseUserEnvVars(raw)
	names := make([]string, 0, len(d.EnvVars))
	for k := range d.EnvVars {
		names = append(names, k)
	}
	sort.Strings(names) // deterministic file ordering
	for _, k := range names {
		if _, ok := present[k]; !ok {
			raw = setEnvVarLine(raw, k, d.EnvVars[k])
		}
	}
	if err := writeEnvFileAtomic(envFilePath(slug), raw); err != nil {
		return "", err
	}
	d.EnvVars = nil
	if err := instancedata.Write(slug, d); err != nil {
		return "", err
	}
	return raw, nil
}

// mutateEnvFile loads .env (migrating legacy vars), applies fn to the raw
// contents, and writes the result back atomically.
func mutateEnvFile(slug string, fn func(raw string) string) error {
	raw, err := loadEnvFile(slug)
	if err != nil {
		return err
	}
	return writeEnvFileAtomic(envFilePath(slug), fn(raw))
}

// EnvVarSet sets a per-env variable (applied on the next start/rebuild).
func EnvVarSet(slug, name, value string) error {
	return mutateEnvFile(slug, func(raw string) string { return setEnvVarLine(raw, name, value) })
}

// EnvVarDelete removes a per-env variable. The bool reports whether the
// variable was actually there.
//
// Node's delete bin tracks the same flag and, when nothing matched, writes a
// warning to stderr and sets process.exitCode = 1 *without* calling
// updateEnvFile (src/bin/vip-dev-env-envvar-delete.js:51-54) — so a miss must
// leave .env byte-for-byte alone as well as fail.
func EnvVarDelete(slug, name string) (bool, error) {
	raw, err := loadEnvFile(slug)
	if err != nil {
		return false, err
	}
	out, removed := deleteEnvVarLine(raw, name)
	if !removed {
		return false, nil
	}
	if err := writeEnvFileAtomic(envFilePath(slug), out); err != nil {
		return false, err
	}
	return true, nil
}

// EnvVarGet returns a single variable.
func EnvVarGet(slug, name string) (string, bool, error) {
	raw, err := loadEnvFile(slug)
	if err != nil {
		return "", false, err
	}
	v, ok := parseUserEnvVars(raw)[name]
	return v, ok, nil
}

// EnvVarGetAll returns all variables (never nil).
func EnvVarGetAll(slug string) (map[string]string, error) {
	raw, err := loadEnvFile(slug)
	if err != nil {
		return nil, err
	}
	return parseUserEnvVars(raw), nil
}

// EnvVarList returns the sorted variable names.
func EnvVarList(slug string) ([]string, error) {
	vars, err := EnvVarGetAll(slug)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(vars))
	for k := range vars {
		names = append(names, k)
	}
	sort.Strings(names)
	return names, nil
}
