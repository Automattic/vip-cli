// installer-version converts the Go release stamp into a native package version.
package main

import (
	"fmt"
	"os"

	"github.com/Automattic/vip/internal/installer"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: installer-version <version>")
		os.Exit(1)
	}
	v, err := installer.NumericVersion(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(v)
}
