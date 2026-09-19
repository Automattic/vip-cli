package devenv

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/Automattic/vip/internal/devenv/compose"
)

// This file ports src/lib/dev-environment/env-vars.ts.
//
// <envdir>/.env is SHARED with the Node CLI: paths.EnvironmentPath is
// byte-identical to Node's getEnvironmentPath, and Node's `vip dev-env envvar
// set|delete|get|list` read and write exactly this file (env-vars.ts:66). It is
// also the delivery mechanism on both sides — Node's Lando template declares
// `env_file: - .env` and Go's php service does the same
// (compose/services.go) — so a variable written here reaches the container
// without any further plumbing.
//
// vip-next additionally needs LANDO_HOST_USER_ID/LANDO_HOST_GROUP_ID in this
// file because docker-compose.yml substitutes ${LANDO_HOST_USER_ID} at parse
// time and Compose resolves those from the project directory's .env. Node does
// not write them here (it injects them through Lando's own config,
// dev-environment-lando.ts:336) and only ever touches the file with
// appendFileSync(path, '') on start. Those two keys are therefore treated as
// "managed": vip-next rewrites them and leaves every other byte alone.

// splitEnvLine ports Node's splitKeyValueString (src/lib/utils.ts:108): split on
// the FIRST '=', trim both sides. A line with no '=' is a key with an empty
// value.
func splitEnvLine(line string) (key, value string) {
	k, v, ok := strings.Cut(line, "=")
	if !ok {
		return strings.TrimSpace(line), ""
	}
	return strings.TrimSpace(k), strings.TrimSpace(v)
}

// parseManagedBlock turns the rendered managed block (compose.RenderEnvFile)
// into ordered key/value pairs, so the set of Go-managed keys has exactly one
// definition instead of being duplicated as a literal list here.
func parseManagedBlock(block string) [][2]string {
	var out [][2]string
	for _, line := range strings.Split(block, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v := splitEnvLine(line)
		if k != "" {
			out = append(out, [2]string{k, v})
		}
	}
	return out
}

// mergeEnvFile applies the managed key/values onto an existing .env, preserving
// every other line verbatim — user variables, comments, blank lines and
// ordering all survive. Managed keys already present are rewritten where they
// stand; missing ones are appended. On an empty input the result is just the
// managed block, i.e. identical to what Materialize used to write outright.
//
// This replaces an unconditional overwrite that destroyed variables set with
// the Node CLI on every create/start/rebuild/update (parity blocker B3).
func mergeEnvFile(existing, managedBlock string) string {
	managed := parseManagedBlock(managedBlock)
	if existing == "" {
		return managedBlock
	}

	// Preserve the original line endings by splitting on "\n" and keeping any
	// trailing "\r" attached to the content we don't rewrite.
	lines := strings.Split(existing, "\n")
	trailingNewline := len(lines) > 0 && lines[len(lines)-1] == ""
	if trailingNewline {
		lines = lines[:len(lines)-1]
	}

	seen := make(map[string]bool, len(managed))
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		key, _ := splitEnvLine(trimmed)
		for _, kv := range managed {
			if key == kv[0] && !seen[key] {
				lines[i] = kv[0] + "=" + kv[1]
				seen[key] = true
			}
		}
	}
	for _, kv := range managed {
		if !seen[kv[0]] {
			lines = append(lines, kv[0]+"="+kv[1])
		}
	}

	out := strings.Join(lines, "\n")
	if !strings.HasSuffix(out, "\n") {
		out += "\n"
	}
	return out
}

// writeEnvFileAtomic writes .env through a sibling temp file and renames it into
// place, mirroring Node's updateEnvFile (env-vars.ts:75-79). A crash mid-write
// therefore leaves the previous file intact rather than a truncated one.
func writeEnvFileAtomic(path, content string) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil { // #nosec G306 -- read by the container user
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// readEnvFileRaw returns the contents of <envdir>/.env, or "" when absent.
func readEnvFileRaw(dir string) (string, error) {
	b, err := os.ReadFile(filepath.Join(dir, ".env")) // #nosec G304 -- fixed name in our own data dir
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// managedEnvKeys is the set of keys vip-next owns in .env. Derived from the
// rendered managed block so the key list has exactly one definition
// (compose.RenderEnvFile) rather than a literal copy that can drift.
func managedEnvKeys() map[string]bool {
	keys := make(map[string]bool)
	for _, kv := range parseManagedBlock(compose.RenderEnvFile(compose.View{})) {
		keys[kv[0]] = true
	}
	return keys
}

// parseEnvValue ports parseEnvValue (env-vars.ts:14): strip matching double or
// single quotes and unescape. Bare values are returned as-is.
func parseEnvValue(value string) string {
	if len(value) >= 2 && strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) {
		inner := value[1 : len(value)-1]
		var b strings.Builder
		for i := 0; i < len(inner); i++ {
			if inner[i] != '\\' || i+1 >= len(inner) {
				b.WriteByte(inner[i])
				continue
			}
			switch c := inner[i+1]; c {
			case '"', '$', '\\':
				b.WriteByte(c)
				i++
			case 'n':
				b.WriteByte('\n')
				i++
			case 'r':
				b.WriteByte('\r')
				i++
			case 't':
				b.WriteByte('\t')
				i++
			default:
				b.WriteByte(inner[i])
			}
		}
		return b.String()
	}
	if len(value) >= 2 && strings.HasPrefix(value, `'`) && strings.HasSuffix(value, `'`) {
		return strings.ReplaceAll(value[1:len(value)-1], `\'`, `'`)
	}
	return value
}

// quoteEnvValue ports quoteEnvValue (env-vars.ts:41): always double-quote,
// escaping backslash, quote, dollar and the three whitespace escapes.
func quoteEnvValue(value string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`"`, `\"`,
		`$`, `\$`,
		"\n", `\n`,
		"\r", `\r`,
		"\t", `\t`,
	)
	return `"` + r.Replace(value) + `"`
}

// parseUserEnvVars returns the user-visible variables in raw .env content:
// comments and blanks dropped (Node's preparseEnvData), values unquoted, and
// the Go-managed LANDO_HOST_* keys excluded — those are ours, and Node's own
// env file never contains them.
func parseUserEnvVars(raw string) map[string]string {
	managed := managedEnvKeys()
	out := make(map[string]string)
	for _, line := range preparseEnvData(raw) {
		k, v := splitEnvLine(line)
		if k == "" || managed[k] {
			continue
		}
		out[k] = parseEnvValue(v)
	}
	return out
}

// preparseEnvData ports preparseEnvData (env-vars.ts:7): split on \r?\n, trim,
// drop blank and #-comment lines.
func preparseEnvData(data string) []string {
	var out []string
	for _, line := range strings.Split(data, "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, line)
	}
	return out
}

// setEnvVarLine rewrites raw .env content so name is bound to value, replacing
// the existing definition where it stands or appending one. Unrelated lines —
// including comments, which Node's own envvar set discards — are preserved.
func setEnvVarLine(raw, name, value string) string {
	quoted := quoteEnvValue(value)
	lines, trailing := splitEnvLines(raw)
	replaced := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if k, _ := splitEnvLine(trimmed); k == name && !replaced {
			lines[i] = name + "=" + quoted
			replaced = true
		}
	}
	if !replaced {
		lines = append(lines, name+"="+quoted)
	}
	return joinEnvLines(lines, trailing)
}

// deleteEnvVarLine removes every line defining name from raw .env content and
// reports whether any line matched — Node's `removed` flag
// (src/bin/vip-dev-env-envvar-delete.js:39-49), which decides between a rewrite
// and an exit-1 warning.
func deleteEnvVarLine(raw, name string) (string, bool) {
	lines, trailing := splitEnvLines(raw)
	kept := make([]string, 0, len(lines))
	removed := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			if k, _ := splitEnvLine(trimmed); k == name {
				removed = true
				continue
			}
		}
		kept = append(kept, line)
	}
	return joinEnvLines(kept, trailing), removed
}

func splitEnvLines(raw string) (lines []string, hadTrailingNewline bool) {
	if raw == "" {
		return nil, true
	}
	lines = strings.Split(raw, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		return lines[:len(lines)-1], true
	}
	return lines, false
}

func joinEnvLines(lines []string, hadTrailingNewline bool) string {
	out := strings.Join(lines, "\n")
	if out != "" && (hadTrailingNewline || !strings.HasSuffix(out, "\n")) {
		out += "\n"
	}
	return out
}
