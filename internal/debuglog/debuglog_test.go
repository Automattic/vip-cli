package debuglog

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestNamespaceFiltering(t *testing.T) {
	for _, tc := range []struct{ selector, want string }{
		{"", ""},
		{"*", "alpha one\nbeta two\n"},
		{"alpha", "alpha one\n"},
		{"a*,beta", "alpha one\nbeta two\n"},
		{"*,-beta", "alpha one\n"},
		{"-beta,*", "alpha one\n"},
		{"alpha beta", "alpha one\nbeta two\n"},
		{"[ab]*", ""},
	} {
		t.Run(tc.selector, func(t *testing.T) {
			var out bytes.Buffer
			ctx := WithLogger(context.Background(), tc.selector, &out)
			Printf(ctx, "alpha", "%s", "one")
			Printf(ctx, "beta", "%s", "two")
			if out.String() != tc.want {
				t.Fatalf("output = %q, want %q", out.String(), tc.want)
			}
		})
	}
}

func TestLoggerIsScopedToContextAndEscapesControls(t *testing.T) {
	var out bytes.Buffer
	ctx := WithLogger(context.Background(), "*", &out)
	Printf(context.Background(), "alpha", "must stay silent")
	Printf(ctx, "alpha", "name=%s", "one\n\x1b[31mtwo")
	if strings.Count(out.String(), "\n") != 1 || strings.Contains(out.String(), "\x1b") {
		t.Fatalf("unsafe output: %q", out.String())
	}
	if !strings.Contains(out.String(), "one") || !strings.Contains(out.String(), "two") {
		t.Fatalf("missing diagnostic: %q", out.String())
	}
}
