// Package sqlvalidation ports Node's src/lib/validations/sql.ts +
// is-multi-site-sql-dump.ts + line-by-line.ts to Go. Local-only — no
// network calls.
package sqlvalidation

import (
	"bufio"
	"io"
)

// readBufSize is the size of the rolling read buffer. It is NOT a per-line
// ceiling: lines longer than this are stitched together from successive
// ReadSlice fragments (see ScanLines).
//
// Node's line-by-line.ts uses fd.readLines(), which imposes no per-line
// limit whatsoever. We previously used a bufio.Scanner with a 16MB cap,
// which rejected dumps Node validates fine — `mysqldump --extended-insert`
// packs a whole table into one INSERT, mydumper does the same, and a single
// row with a multi-MB LONGTEXT column is enough on its own. Worse, the
// failure surfaced to the user as the raw Go internal
// "bufio.Scanner: token too long".
//
// Memory: only ONE line is ever held at a time, so a multi-GB dump costs
// max(readBufSize, longest line) — the file is never loaded whole.
const readBufSize = 256 * 1024

// ScanLines reads r line-by-line and calls fn for each line payload. Line
// numbers are 1-indexed (Node's lineNum starts at 1 in sql.ts). Returns the
// first non-nil error returned by fn (stops scanning on that line) or any
// underlying read error.
//
// Line splitting matches bufio.ScanLines and Node's readline: '\n'
// terminates a line and a single trailing '\r' is stripped, so CRLF dumps
// behave identically. A final line without a trailing newline is still
// delivered.
//
// Mirrors Node's src/lib/validations/line-by-line.ts getReadInterface +
// the perLineValidations dispatch loop in sql.ts.
func ScanLines(r io.Reader, fn func(line string, lineNum int) error) error {
	br := bufio.NewReaderSize(r, readBufSize)

	lineNum := 1
	for {
		line, err := readLine(br)
		if err != nil && err != io.EOF {
			return err
		}
		// At EOF with nothing buffered there is no final partial line.
		if err == io.EOF && len(line) == 0 {
			return nil
		}
		if cbErr := fn(string(trimEOL(line)), lineNum); cbErr != nil {
			return cbErr
		}
		lineNum++
		if err == io.EOF {
			return nil
		}
	}
}

// readLine returns the next '\n'-terminated chunk, growing past the read
// buffer when necessary. The returned slice may alias br's internal buffer
// when the line fit in one read, so callers must copy (ScanLines converts
// to string immediately) before the next read.
func readLine(br *bufio.Reader) ([]byte, error) {
	frag, err := br.ReadSlice('\n')
	if err != bufio.ErrBufferFull {
		return frag, err
	}
	// Long line: keep pulling fragments until the delimiter (or EOF).
	// append copies frag out of br's buffer before it is reused.
	buf := append([]byte(nil), frag...)
	for err == bufio.ErrBufferFull {
		frag, err = br.ReadSlice('\n')
		buf = append(buf, frag...)
	}
	return buf, err
}

// trimEOL drops the trailing '\n' and an immediately preceding '\r',
// matching bufio.ScanLines and Node's readline /\r?\n/ split.
func trimEOL(b []byte) []byte {
	if n := len(b); n > 0 && b[n-1] == '\n' {
		b = b[:n-1]
	}
	if n := len(b); n > 0 && b[n-1] == '\r' {
		b = b[:n-1]
	}
	return b
}
