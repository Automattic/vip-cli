// Package envvar — value-echo confirm helper for vip config envvar set --from-file.
package envvar

import (
	"fmt"
	"io"
)

// EchoValueForConfirm prints the read-from-file value between Node-parity
// banners so the user can confirm before the mutation fires. Called from
// runEnvvarSet when --from-file is used AND --skip-confirmation is NOT set.
//
// Output shape mirrors src/bin/vip-config-envvar-set.js exactly:
//
//	===== Received value printed below =====
//	<value verbatim>
//	===== Received value printed above =====
//	<blank line>
//
// Caller follows up with `appctx.Confirm(cmd, "Please confirm the input value above", false)`.
func EchoValueForConfirm(stdout io.Writer, value string) {
	fmt.Fprintln(stdout, "===== Received value printed below =====")
	fmt.Fprintln(stdout, value)
	fmt.Fprintln(stdout, "===== Received value printed above =====")
	fmt.Fprintln(stdout)
}
