package searchreplace

import (
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestGetSqlDumpDetailsMyDumper(t *testing.T) {
	p := write(t, "d.sql", "-- metadata.header 1\n-- mydb-schema-create.sql 0\nSELECT 1;\n")
	d, err := GetSqlDumpDetails(p)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != DumpTypeMyDumper || d.SourceDB != "mydb" {
		t.Errorf("details = %+v", d)
	}
}

func TestGetSqlDumpDetailsMysqldump(t *testing.T) {
	p := write(t, "d.sql", "-- MySQL dump 10.13\nCREATE TABLE wp_posts;\n")
	d, err := GetSqlDumpDetails(p)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != DumpTypeMysqldump {
		t.Errorf("details = %+v", d)
	}
}

func TestGetSqlDumpDetailsStopsAt100Lines(t *testing.T) {
	content := strings.Repeat("SELECT 1;\n", 150) + "-- metadata.header 1\n"
	p := write(t, "d.sql", content)
	d, err := GetSqlDumpDetails(p)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != DumpTypeMysqldump {
		t.Error("metadata.header after line 100 must not flip the type (database.ts:62)")
	}
}

func TestGetSqlDumpDetailsGz(t *testing.T) {
	p := filepath.Join(t.TempDir(), "d.sql.gz")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	zw := gzip.NewWriter(f)
	if _, err := zw.Write([]byte("-- metadata.header 1\n-- gzdb-schema-create.sql 0\n")); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	d, err := GetSqlDumpDetails(p)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != DumpTypeMyDumper || d.SourceDB != "gzdb" {
		t.Errorf("details = %+v", d)
	}
}

func TestFixMyDumperLine(t *testing.T) {
	if got := FixMyDumperLine("-- wp_posts 12345"); got != "-- wp_posts -1" {
		t.Errorf("got %q", got)
	}
	if got := FixMyDumperLine("INSERT INTO wp_posts VALUES (1);"); got != "INSERT INTO wp_posts VALUES (1);" {
		t.Errorf("non-matching line altered: %q", got)
	}
}
