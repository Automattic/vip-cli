package dockercli

import "testing"

func TestParseComposePSNDJSON(t *testing.T) {
	in := []byte(`{"Service":"wordpress","State":"exited","ExitCode":0}
{"Service":"php","State":"running","ExitCode":0}`)
	got, err := parseComposePS(in)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Service != "wordpress" || got[0].State != "exited" || got[0].ExitCode != 0 {
		t.Fatalf("bad parse: %+v", got)
	}
	if got[1].Service != "php" || got[1].State != "running" {
		t.Fatalf("bad parse: %+v", got)
	}
}

func TestParseComposePSArray(t *testing.T) {
	in := []byte(`[{"Service":"db","State":"running","ExitCode":0}]`)
	got, err := parseComposePS(in)
	if err != nil || len(got) != 1 || got[0].Service != "db" {
		t.Fatalf("array parse failed: %+v err=%v", got, err)
	}
}

func TestParseComposePSEmpty(t *testing.T) {
	got, err := parseComposePS([]byte("  \n"))
	if err != nil || len(got) != 0 {
		t.Fatalf("empty should yield no services: %+v err=%v", got, err)
	}
}
