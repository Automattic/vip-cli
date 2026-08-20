package sqlvalidation

import (
	"bytes"
	"errors"
	"strconv"
	"strings"
	"testing"
)

func TestScanLinesBasic(t *testing.T) {
	in := strings.NewReader("one\ntwo\nthree\n")
	var got []string
	var nums []int
	err := ScanLines(in, func(line string, n int) error {
		got = append(got, line)
		nums = append(nums, n)
		return nil
	})
	if err != nil {
		t.Fatalf("ScanLines err: %v", err)
	}
	wantLines := []string{"one", "two", "three"}
	wantNums := []int{1, 2, 3}
	if len(got) != len(wantLines) {
		t.Fatalf("lines len = %d, want %d", len(got), len(wantLines))
	}
	for i := range wantLines {
		if got[i] != wantLines[i] {
			t.Errorf("line[%d] = %q, want %q", i, got[i], wantLines[i])
		}
		if nums[i] != wantNums[i] {
			t.Errorf("num[%d] = %d, want %d", i, nums[i], wantNums[i])
		}
	}
}

func TestScanLinesPredicateError(t *testing.T) {
	in := strings.NewReader("one\ntwo\nthree\n")
	sentinel := errors.New("stop")
	var seen []string
	err := ScanLines(in, func(line string, n int) error {
		seen = append(seen, line)
		if n == 2 {
			return sentinel
		}
		return nil
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("err = %v, want sentinel", err)
	}
	if len(seen) != 2 {
		t.Errorf("processed %d lines, want 2 (scan should stop on predicate err)", len(seen))
	}
}

func TestScanLinesLargeLine(t *testing.T) {
	// 1MB single-line payload — well within the 16MB cap but far past
	// bufio's default 64KB token limit.
	big := bytes.Repeat([]byte("x"), 1<<20)
	in := bytes.NewReader(append(big, '\n'))
	count := 0
	err := ScanLines(in, func(line string, _ int) error {
		count++
		if len(line) != 1<<20 {
			t.Errorf("got line len %d, want %d", len(line), 1<<20)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("ScanLines err: %v", err)
	}
	if count != 1 {
		t.Errorf("processed %d lines, want 1", count)
	}
}

// Register 2.17. Node's line-by-line.ts uses fd.readLines(), which has no
// per-line ceiling at all — a `mysqldump --extended-insert` file, mydumper
// output, or a row with a multi-MB LONGTEXT column routinely produces a
// single INSERT line well past 16MB. Go must read it too, and must never
// surface a bufio internal ("bufio.Scanner: token too long") to the user.
func TestScanLinesLineLargerThanFormer16MBCap(t *testing.T) {
	const size = 20 << 20 // 20MB — decisively past the old 16MB cap
	big := bytes.Repeat([]byte("x"), size)
	in := bytes.NewReader(append(big, '\n'))

	count := 0
	gotLen := 0
	err := ScanLines(in, func(line string, _ int) error {
		count++
		gotLen = len(line)
		return nil
	})
	if err != nil {
		t.Fatalf("ScanLines err = %v, want nil (Node has no per-line cap)", err)
	}
	if count != 1 {
		t.Fatalf("processed %d lines, want 1", count)
	}
	if gotLen != size {
		t.Errorf("line len = %d, want %d (line was truncated)", gotLen, size)
	}
}

// A long line must not swallow the lines that follow it.
func TestScanLinesResumesAfterOversizeLine(t *testing.T) {
	var buf bytes.Buffer
	buf.WriteString("first\n")
	buf.Write(bytes.Repeat([]byte("y"), 18<<20))
	buf.WriteString("\nlast\n")

	var got []string
	err := ScanLines(&buf, func(line string, _ int) error {
		if len(line) > 64 {
			got = append(got, "<big:"+strconv.Itoa(len(line))+">")
			return nil
		}
		got = append(got, line)
		return nil
	})
	if err != nil {
		t.Fatalf("ScanLines err = %v, want nil", err)
	}
	want := []string{"first", "<big:" + strconv.Itoa(18<<20) + ">", "last"}
	if len(got) != len(want) {
		t.Fatalf("got %d lines %v, want %d %v", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("line[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

// bufio.Scanner's ScanLines strips a trailing \r; Node's readline splits on
// /\r?\n/ and does the same. CRLF dumps (Windows-authored mysqldump output)
// must keep behaving that way after the Scanner is replaced.
func TestScanLinesStripsCarriageReturn(t *testing.T) {
	in := strings.NewReader("one\r\ntwo\r\n")
	var got []string
	if err := ScanLines(in, func(line string, _ int) error {
		got = append(got, line)
		return nil
	}); err != nil {
		t.Fatalf("ScanLines err: %v", err)
	}
	if len(got) != 2 || got[0] != "one" || got[1] != "two" {
		t.Errorf("got %#v, want [one two]", got)
	}
}

func TestScanLinesNoTrailingNewline(t *testing.T) {
	in := strings.NewReader("one\ntwo")
	var got []string
	if err := ScanLines(in, func(line string, _ int) error {
		got = append(got, line)
		return nil
	}); err != nil {
		t.Fatalf("ScanLines err: %v", err)
	}
	if len(got) != 2 || got[0] != "one" || got[1] != "two" {
		t.Errorf("got %#v, want [one two]", got)
	}
}
