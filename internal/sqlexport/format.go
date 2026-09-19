// Package sqlexport ports src/commands/export-sql.ts — the `vip export
// sql` workflow: latest-backup lookup, export-job creation + polling,
// download-link generation, partial exports (live backup copy), the
// disk-space confirmation, and the streamed download.
package sqlexport

import (
	"fmt"
	"math"
)

// formatBytesBase ports format.ts formatBytes: powers of `base`
// (1024 for formatBytes, 1000 for formatMetricBytes), 2 decimals,
// sizes [bytes KB MB GB TB], "0 bytes" for zero.
func formatBytesBase(bytes int64, base float64) string {
	if bytes == 0 {
		return "0 bytes"
	}
	sizes := []string{"bytes", "KB", "MB", "GB", "TB"}
	i := int(math.Floor(math.Log(float64(bytes)) / math.Log(base)))
	if i >= len(sizes) {
		i = len(sizes) - 1
	}
	if i < 0 {
		i = 0
	}
	value := float64(bytes) / math.Pow(base, float64(i))
	// Node: parseFloat(value.toFixed(decimals)) — trailing zeros dropped.
	s := fmt.Sprintf("%.2f", value)
	// Trim trailing zeros and a dangling dot, mirroring parseFloat.
	for len(s) > 0 && s[len(s)-1] == '0' {
		s = s[:len(s)-1]
	}
	if len(s) > 0 && s[len(s)-1] == '.' {
		s = s[:len(s)-1]
	}
	return s + " " + sizes[i]
}

// FormatBytes — format.ts formatBytes default (1024-based).
func FormatBytes(bytes int64) string { return formatBytesBase(bytes, 1024) }

// FormatMetricBytes — format.ts:231 (1000-based, "how it's displayed on Macs").
func FormatMetricBytes(bytes int64) string { return formatBytesBase(bytes, 1000) }
