package dockercli

import (
	"reflect"
	"testing"
)

func TestParseComposePSPreservesPublishedPorts(t *testing.T) {
	row := `{"Service":"database","State":"running","Publishers":[{"URL":"127.0.0.1","TargetPort":3306,"PublishedPort":49153,"Protocol":"tcp"}]}`
	for _, input := range []string{row + "\n", "[" + row + "]"} {
		got, err := parseComposePS([]byte(input))
		if err != nil {
			t.Fatal(err)
		}
		want := []PortPublisher{{URL: "127.0.0.1", TargetPort: 3306, PublishedPort: 49153, Protocol: "tcp"}}
		if len(got) != 1 || !reflect.DeepEqual(got[0].Publishers, want) {
			t.Fatalf("lost host bindings: %+v", got)
		}
	}
}

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
