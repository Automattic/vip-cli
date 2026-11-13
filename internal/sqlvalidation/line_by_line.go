// Package sqlvalidation ports Node's src/lib/validations/sql.ts +
// is-multi-site-sql-dump.ts + line-by-line.ts to Go. Local-only — no
// network calls.
package sqlvalidation

import (
	"bufio"
	"bytes"
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
// Line splitting matches Node's readline: LF, CRLF, and lone CR terminate
// lines. A final line without a trailing newline is still delivered.
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

// readLine reads through LF, CRLF, or CR, retaining only the current line.
// Peek fills a bounded window; a CRLF pair may straddle two such windows.
func readLine(br *bufio.Reader) ([]byte, error) {
	var line []byte
	for {
		if _, err := br.Peek(1); err != nil {
			return line, err
		}
		window, _ := br.Peek(br.Buffered())
		end := bytes.IndexAny(window, "\r\n")
		if end < 0 {
			line = append(line, window...)
			_, _ = br.Discard(len(window))
			continue
		}
		terminator := window[end]
		line = append(line, window[:end+1]...)
		_, _ = br.Discard(end + 1)
		if terminator == '\r' {
			if next, _ := br.Peek(1); len(next) > 0 && next[0] == '\n' {
				_, _ = br.Discard(1)
			}
		}
		return line, nil
	}
}

// trimEOL drops the trailing '\n' and an immediately preceding '\r',
// matching Node's readline split.
func trimEOL(b []byte) []byte {
	if n := len(b); n > 0 && b[n-1] == '\n' {
		b = b[:n-1]
	}
	if n := len(b); n > 0 && b[n-1] == '\r' {
		b = b[:n-1]
	}
	return b
}
