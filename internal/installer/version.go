// Package installer defines the version contract shared by native packages.
package installer

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var versionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(alpha|beta|rc)\.(0|[1-9][0-9]*)|dev\.[0-9A-Za-z]+))?$`)

// NumericVersion preserves release ordering in MSI's three numeric fields.
// Each patch reserves 1000 values: dev=0, alpha=100..299, beta=300..499,
// rc=500..699, stable=999. Bounds are checked rather than silently truncating
// a version, which could otherwise make a newer release look like a downgrade.
func NumericVersion(version string) (string, error) {
	m := versionPattern.FindStringSubmatch(version)
	if m == nil {
		return "", fmt.Errorf("invalid installer version %q", version)
	}
	values := make([]int, 3)
	for i, max := range []int{255, 255, 64} {
		n, err := strconv.Atoi(m[i+1])
		if err != nil || n > max {
			return "", fmt.Errorf("installer version %q exceeds numeric field %d limit %d", version, i+1, max)
		}
		values[i] = n
	}
	stage := 999
	if m[4] != "" {
		n, err := strconv.Atoi(m[5])
		if err != nil || n > 199 {
			return "", fmt.Errorf("installer prerelease number must be between 0 and 199")
		}
		stage = map[string]int{"alpha": 100, "beta": 300, "rc": 500}[m[4]] + n
	} else if strings.Contains(version, "-dev.") {
		stage = 0
	}
	return fmt.Sprintf("%d.%d.%d", values[0], values[1], values[2]*1000+stage), nil
}
