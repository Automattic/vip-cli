// installer-payload extracts verified binary artifacts for native packaging.
package main

import (
	"fmt"
	"github.com/Automattic/vip/internal/releasepromotion"
	"os"
)

func main() {
	if len(os.Args) != 4 {
		fmt.Fprintln(os.Stderr, "usage: installer-payload <darwin|windows> <archive> <new-directory>")
		os.Exit(1)
	}
	if err := releasepromotion.ExtractBinaryArchive(os.Args[1], os.Args[2], os.Args[3]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
