package devenv

import "testing"

func TestParseVolumeLines(t *testing.T) {
	got := parseVolumeLines([]byte("alpha\nbeta\n\ngamma\n"))
	want := []string{"alpha", "beta", "gamma"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	if len(parseVolumeLines([]byte(""))) != 0 {
		t.Fatal("empty input should yield no names")
	}
}

func TestParseSiteListCSV(t *testing.T) {
	csv := "domain\nnet.vipdev.site\nsub1.net.vipdev.site\nsub2.net.vipdev.site\n"
	got := parseSiteListCSV([]byte(csv))
	want := []string{"net.vipdev.site", "sub1.net.vipdev.site", "sub2.net.vipdev.site"}
	if len(got) != len(want) {
		t.Fatalf("parseSiteListCSV = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("row %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestParseContainerLines(t *testing.T) {
	raw := []byte("abc123\texample_php_1\ndef456\texample_database_1\n\n")
	got := parseContainerLines(raw)
	if len(got) != 2 {
		t.Fatalf("want 2 containers, got %+v", got)
	}
	if got[0].ID != "abc123" || got[0].Name != "example_php_1" {
		t.Fatalf("bad parse: %+v", got[0])
	}
}
