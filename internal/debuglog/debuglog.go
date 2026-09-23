// Package debuglog emits opt-in diagnostics using Node debug namespace selectors.
// Loggers belong to an invocation context, so commands and tests cannot leak
// their debug settings or output writers into another invocation.
package debuglog

import (
	"context"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
	"unicode"
)

type contextKey struct{}

type logger struct {
	mu               sync.Mutex
	out              io.Writer
	include, exclude []*regexp.Regexp
}

// WithLogger accepts comma/whitespace-separated namespaces, '*' wildcards,
// and '-' exclusions, matching the Node debug package's selector grammar.
func WithLogger(ctx context.Context, namespaces string, out io.Writer) context.Context {
	l := &logger{out: out}
	for _, pattern := range strings.FieldsFunc(namespaces, func(r rune) bool { return r == ',' || unicode.IsSpace(r) }) {
		exclude := strings.HasPrefix(pattern, "-")
		pattern = strings.TrimPrefix(pattern, "-")
		if pattern == "" {
			continue
		}
		expression := "^" + strings.ReplaceAll(regexp.QuoteMeta(pattern), `\*`, ".*") + "$"
		re := regexp.MustCompile(expression)
		if exclude {
			l.exclude = append(l.exclude, re)
		} else {
			l.include = append(l.include, re)
		}
	}
	return context.WithValue(ctx, contextKey{}, l)
}

// Enabled lets callers avoid constructing expensive diagnostic metadata when
// its namespace is disabled.
func Enabled(ctx context.Context, namespace string) bool {
	if ctx == nil {
		return false
	}
	l, _ := ctx.Value(contextKey{}).(*logger)
	if l == nil || l.out == nil {
		return false
	}
	for _, re := range l.exclude {
		if re.MatchString(namespace) {
			return false
		}
	}
	for _, re := range l.include {
		if re.MatchString(namespace) {
			return true
		}
	}
	return false
}

// Printf writes one diagnostic line if namespace is enabled. Callers must pass
// only safe fields: this function escapes terminal controls, not secrets.
func Printf(ctx context.Context, namespace, format string, args ...any) {
	if !Enabled(ctx, namespace) {
		return
	}
	l := ctx.Value(contextKey{}).(*logger)
	line := namespace + " " + fmt.Sprintf(format, args...)
	line = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, line)
	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = fmt.Fprintln(l.out, line)
}
