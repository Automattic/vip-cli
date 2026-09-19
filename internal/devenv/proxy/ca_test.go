package proxy

import (
	"context"
	"strings"
	"testing"
)

func TestProxyRunArgsMountsCertsVolume(t *testing.T) {
	joined := strings.Join(proxyRunArgs(Ports{HTTP: 80, HTTPS: 443}, "vipdev.lndo.site"), " ")
	if !strings.Contains(joined, ProxyCertsVolume+":/certs") {
		t.Fatalf("proxy run args missing certs volume mount:\n%s", joined)
	}
	if strings.Contains(joined, "TODO") {
		t.Fatalf("TODO placeholder still present:\n%s", joined)
	}
}

func TestCAHostPathUnderXDG(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/data")
	if got := CAHostPath(); got != "/data/vip/dev-env/proxy/ca.pem" {
		t.Fatalf("CAHostPath = %q", got)
	}
}

func TestEnsureCARunsGenScript(t *testing.T) {
	r := &fakeRunner{}
	if err := EnsureCA(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 1 {
		t.Fatalf("expected 1 docker call, got %d: %v", len(r.calls), r.calls)
	}
	joined := strings.Join(r.calls[0], " ")
	for _, want := range []string{"run", "--rm", ProxyCertsVolume + ":/certs", ProxyImage, "sh", "-c"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("EnsureCA call missing %q:\n%s", want, joined)
		}
	}
	// the embedded script must actually generate the CA
	last := r.calls[0][len(r.calls[0])-1]
	if !strings.Contains(last, "lndo.site.pem") {
		t.Fatalf("gen script not passed as final arg:\n%s", last)
	}
}

func TestEnsureCertBuildsEnvAndMounts(t *testing.T) {
	r := &fakeRunner{}
	err := EnsureCert(context.Background(), r, CertRequest{
		Basename:   "example",
		CommonName: "example.vipdev.lndo.site",
		SANs:       []string{"example.vipdev.lndo.site", "*.vipdev.lndo.site", "localhost"},
	})
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(r.calls[0], " ")
	for _, want := range []string{
		"proxy_config:/proxy_config",
		"CERT_BASENAME=example",
		"CERT_CN=example.vipdev.lndo.site",
		"CERT_SANS=example.vipdev.lndo.site *.vipdev.lndo.site localhost",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("EnsureCert call missing %q:\n%s", want, joined)
		}
	}
}

func TestEnsureCertRejectsEmpty(t *testing.T) {
	r := &fakeRunner{}
	if err := EnsureCert(context.Background(), r, CertRequest{Basename: "x"}); err == nil {
		t.Fatal("expected error when SANs empty")
	}
}

func TestEnsureCertRejectsEmptyBasename(t *testing.T) {
	r := &fakeRunner{}
	if err := EnsureCert(context.Background(), r, CertRequest{SANs: []string{"foo.test"}}); err == nil {
		t.Fatal("expected error when Basename empty")
	}
}

func TestEnsureCertRejectsBadChars(t *testing.T) {
	r := &fakeRunner{}
	cases := []CertRequest{
		{Basename: "a/b", SANs: []string{"foo.test"}},
		{Basename: "ok", CommonName: "bad/cn", SANs: []string{"foo.test"}},
		{Basename: "ok", SANs: []string{"foo bar"}},
	}
	for i, c := range cases {
		if err := EnsureCert(context.Background(), r, c); err == nil {
			t.Fatalf("case %d: expected validation error for %+v", i, c)
		}
	}
}

func TestExtractCACopiesFromProxy(t *testing.T) {
	r := &fakeRunner{}
	dest, err := ExtractCA(context.Background(), r, t.TempDir()+"/ca.pem")
	if err != nil {
		t.Fatal(err)
	}
	if dest == "" {
		t.Fatal("ExtractCA should return the dest path")
	}
	joined := strings.Join(r.calls[0], " ")
	if !strings.Contains(joined, "cp") || !strings.Contains(joined, ProxyContainerName+":"+caContainerPath) {
		t.Fatalf("ExtractCA should docker cp the CA from the proxy:\n%s", joined)
	}
}
