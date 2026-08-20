// Package searchreplace ports src/lib/search-and-replace.ts by shelling
// out to the existing Go `go-search-replace` binary (design §7.3 — NOT a
// reimplementation), plus the SQL-dump-type sniffing from
// src/lib/database.ts that the replace pipeline depends on.
package searchreplace

import (
	"bufio"
	"compress/gzip"
	"io"
	"os"
	"regexp"
	"strings"
)

// DumpType mirrors Node's SqlDumpType enum (database.ts:8).
type DumpType string

const (
	DumpTypeMyDumper  DumpType = "MYDUMPER"
	DumpTypeMysqldump DumpType = "MYSQLDUMP"
)

// DumpDetails mirrors SqlDumpDetails (database.ts:13).
type DumpDetails struct {
	Type     DumpType
	SourceDB string
}

var (
	// database.ts:44
	metadataHeaderRE = regexp.MustCompile(`^-- metadata\.header `)
	// database.ts:46
	sourceDBRE = regexp.MustCompile(`^-- (.*)-schema-create\.sql`)
	// fixMyDumperRE — database.ts:110.
	fixMyDumperRE = regexp.MustCompile(`^-- ([^ ]+) \d+$`)
)

// GetSqlDumpDetails ports getSqlDumpDetails (database.ts:18): scan up to
// the first ~100 non-empty lines for mydumper markers. Transparent .gz
// support (suffix-based, like Node).
func GetSqlDumpDetails(filePath string) (DumpDetails, error) {
	f, err := os.Open(filePath) // #nosec G304 -- caller-supplied CLI path
	if err != nil {
		return DumpDetails{}, err
	}
	defer f.Close()

	var r io.Reader = f
	if strings.HasSuffix(filePath, ".gz") {
		zr, err := gzip.NewReader(f)
		if err != nil {
			return DumpDetails{}, err
		}
		defer zr.Close()
		r = zr
	}

	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)

	isMyDumper := false
	sourceDB := ""
	lineNo := 0
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if metadataHeaderRE.MatchString(line) {
			isMyDumper = true
		}
		if m := sourceDBRE.FindStringSubmatch(line); m != nil && sourceDB == "" {
			sourceDB = m[1]
		}
		if isMyDumper && sourceDB != "" {
			// all fields found? end the search early (database.ts:57)
			break
		}
		if lineNo > 100 {
			// database.ts:62 — assume not mydumper past the 100th line
			break
		}
		lineNo++
	}
	if err := scanner.Err(); err != nil {
		return DumpDetails{}, err
	}
	typ := DumpTypeMysqldump
	if isMyDumper {
		typ = DumpTypeMyDumper
	}
	return DumpDetails{Type: typ, SourceDB: sourceDB}, nil
}

// FixMyDumperLine ports fixMyDumperTransform's per-line rewrite
// (database.ts:109): `-- <table> <n>` becomes `-- <table> -1`.
func FixMyDumperLine(line string) string {
	m := fixMyDumperRE.FindStringSubmatch(line)
	if m == nil {
		return line
	}
	return "-- " + m[1] + " -1"
}
