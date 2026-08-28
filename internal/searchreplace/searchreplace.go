package searchreplace

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// InPlaceConfirmMessage is the prompt Node shows before an irreversible
// in-place rewrite (search-and-replace.ts:152-155). Node's enquirer confirm
// defaults to No, so callers must pass defaultYes=false.
const InPlaceConfirmMessage = "Are you sure you want to run search and replace on your input file? This operation is not reversible."

// Options mirror SearchReplaceOptions (search-and-replace.ts:101).
//
// The in-place confirm is the CALLER's job, mirroring Node's batchMode gate
// (`inPlace && !batchMode`, ts:151). Which callers prompt is NOT uniform, so
// check the Node source before adding or removing one:
//
//   - platform `vip import sql` passes batchMode:true (vip-import-sql.js:732)
//     and must NOT prompt — the command has already confirmed.
//   - standalone `vip search-replace` passes no batchMode
//     (vip-search-replace.js:74) and DOES prompt.
//   - `vip dev-env import sql` reaches this through resolveImportPath with no
//     batchMode (dev-environment-core.ts:854) and DOES prompt.
type Options struct {
	InPlace bool
	Output  string // non-empty => write to this path; empty + !InPlace => temp file
}

// Result mirrors SearchReplaceOutput (search-and-replace.ts:108).
type Result struct {
	InputFileName  string
	OutputFileName string
	UsingStdOut    bool // always false in M7a (import path never streams to stdout)
}

// ResolveBinary finds go-search-replace per design §7.3:
// $VIP_SEARCH_REPLACE_BIN → <executable-dir>/bin/go-search-replace[.exe]
// → <executable-dir>/go-search-replace[.exe] (sibling — where `make build`
// drops the bundled binary next to bin/vip-next) → PATH.
func ResolveBinary() (string, error) {
	if p := os.Getenv("VIP_SEARCH_REPLACE_BIN"); p != "" {
		return p, nil
	}
	name := "go-search-replace"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if exe, err := os.Executable(); err == nil {
		if p, ok := lookupBundled(exe, name); ok {
			return p, nil
		}
	}
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	return "", errors.New("unable to locate the go-search-replace binary; set VIP_SEARCH_REPLACE_BIN or add go-search-replace to PATH")
}

// lookupBundled resolves any symlink on exePath (vip-next is commonly run via a
// PATH symlink like ~/.local/bin/vip-next, and os.Executable() returns the
// symlink, not its target, on macOS), then looks for <name> under <dir>/bin/
// (release-tarball layout) or <dir>/ (sibling — where `make build` drops it).
func lookupBundled(exePath, name string) (string, bool) {
	if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
		exePath = resolved
	}
	dir := filepath.Dir(exePath)
	for _, cand := range []string{filepath.Join(dir, "bin", name), filepath.Join(dir, name)} {
		if statExists(cand) {
			return cand, true
		}
	}
	return "", false
}

func statExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// Run ports searchAndReplace (search-and-replace.ts:114) minus prompts and
// telemetry (caller's job): determine replacements, wire input/output
// files, stream input → go-search-replace → (optional mydumper fix) →
// output.
func Run(fileName string, pairs []string, opts Options) (*Result, error) {
	// Node: if (!pairs.length) throw (ts:138)
	if len(pairs) == 0 {
		return nil, errors.New("No search and replace parameters provided.")
	}
	details, err := GetSqlDumpDetails(fileName)
	if err != nil {
		return nil, err
	}

	// Node: pairs.flatMap(pair => pair.split(',').map(trim)) (ts:148)
	var replacements []string
	for _, pair := range pairs {
		for _, part := range strings.Split(pair, ",") {
			replacements = append(replacements, strings.TrimSpace(part))
		}
	}

	inputPath := fileName
	outputPath := opts.Output
	if opts.InPlace {
		// Node copies the input to a temp "midput" file first (ts:40-58) because
		// it opens a write stream on the original immediately. We instead stage
		// the result in a sibling temp file and rename it into place only on
		// success (see below), so the original is never truncated and can be
		// read directly — no full extra copy of a multi-GB dump.
		outputPath = fileName
	} else if outputPath == "" {
		// Default: temp output file keeping the basename (ts:79-90).
		tmpDir, err := os.MkdirTemp("", "vip-search-replace")
		if err != nil {
			return nil, err
		}
		outputPath = filepath.Join(tmpDir, filepath.Base(fileName))
	}

	bin, err := ResolveBinary()
	if err != nil {
		return nil, err
	}

	in, err := os.Open(inputPath) // #nosec G304
	if err != nil {
		return nil, err
	}
	defer in.Close()

	// Stage the result in a temp file beside the target and rename it into place
	// only after go-search-replace exits cleanly. Opening the target directly
	// (os.Create) truncates it before the child's result is known, so a rejected
	// search-replace pair left the user with a 0-byte file — and under
	// --in-place that file is their own dump (parity blocker B2). The temp sits
	// in the target's directory so the rename is same-filesystem, hence atomic;
	// every failure path below removes it.
	tmpPath, out, err := createTempBeside(outputPath)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = out.Close()
			_ = os.Remove(tmpPath)
		}
	}()

	cmd := exec.Command(bin, replacements...) // #nosec G204 -- resolved binary + user-supplied pairs
	cmd.Stdin = in
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	if details.Type == DumpTypeMyDumper {
		err = pipeFixingMyDumper(stdout, out)
	} else {
		_, err = io.Copy(out, stdout)
	}
	if err != nil {
		_ = cmd.Wait()
		return nil, fmt.Errorf("couldn't write to the output file: %w", err)
	}
	if err := cmd.Wait(); err != nil {
		return nil, err
	}
	if err := out.Close(); err != nil {
		return nil, err
	}
	if err := os.Rename(tmpPath, outputPath); err != nil {
		return nil, err
	}
	committed = true

	return &Result{InputFileName: fileName, OutputFileName: outputPath}, nil
}

// createTempBeside opens a uniquely named temp file in target's directory, so a
// later os.Rename onto target stays on one filesystem (cross-device renames
// fail). When target already exists the temp is chmod'ed to match it, so an
// atomic replace never silently widens or narrows the file's permissions; for a
// new target the 0666 open mode reproduces os.Create's umask-respecting default.
func createTempBeside(target string) (string, *os.File, error) {
	dir := filepath.Dir(target)
	perm, hadTarget := os.FileMode(0), false
	if st, err := os.Stat(target); err == nil {
		perm, hadTarget = st.Mode().Perm(), true
	}
	for attempt := 0; attempt < 100; attempt++ {
		var buf [8]byte
		if _, err := rand.Read(buf[:]); err != nil {
			return "", nil, err
		}
		p := filepath.Join(dir, "."+filepath.Base(target)+".vip-sr-"+hex.EncodeToString(buf[:]))
		f, err := os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o666) // #nosec G304
		if errors.Is(err, os.ErrExist) {
			continue
		}
		if err != nil {
			return "", nil, err
		}
		if hadTarget {
			if err := f.Chmod(perm); err != nil {
				_ = f.Close()
				_ = os.Remove(p)
				return "", nil, err
			}
		}
		return p, f, nil
	}
	return "", nil, errors.New("unable to create a temporary file next to " + target)
}

// pipeFixingMyDumper streams r to w applying FixMyDumperLine per line —
// Node's fixMyDumperTransform stage in the pipeline (ts:184).
func pipeFixingMyDumper(r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	bw := bufio.NewWriter(w)
	for scanner.Scan() {
		if _, err := bw.WriteString(FixMyDumperLine(scanner.Text()) + "\n"); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return bw.Flush()
}
