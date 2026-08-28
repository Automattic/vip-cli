package commands

import (
	"fmt"
	"github.com/Automattic/vip/internal/nodeflags"
	"github.com/spf13/cobra"
	"strings"
)

const edgeWorkersBareValue = "\x00"

type edgeWorkersStringFlag struct{ Values []string }

func (v *edgeWorkersStringFlag) String() string {
	if len(v.Values) == 0 {
		return ""
	}
	return v.Values[len(v.Values)-1]
}
func (*edgeWorkersStringFlag) Type() string         { return "string" }
func (v *edgeWorkersStringFlag) Set(s string) error { v.Values = append(v.Values, s); return nil }
func edgeWorkersOptionValue(v *edgeWorkersStringFlag) any {
	if len(v.Values) == 0 {
		return nil
	}
	values := make([]any, len(v.Values))
	for i, s := range v.Values {
		values[i] = s
		if s == edgeWorkersBareValue {
			values[i] = true
		}
	}
	if len(values) == 1 {
		return values[0]
	}
	return values
}
func edgeOptionText(value any) string {
	if values, ok := value.([]any); ok {
		parts := make([]string, len(values))
		for i, v := range values {
			parts[i] = fmt.Sprint(v)
		}
		return strings.Join(parts, ",")
	}
	return fmt.Sprint(value)
}
func edgeStringFlag(c *cobra.Command, name, short, description string) *edgeWorkersStringFlag {
	v := &edgeWorkersStringFlag{}
	c.Flags().VarP(v, name, short, description)
	nodeflags.MarkOptionalValue(c, edgeWorkersBareValue, name)
	return v
}
func edgePathFlag(c *cobra.Command) *edgeWorkersStringFlag {
	return edgeStringFlag(c, "path", "p", "Path to the edge-workers project. Defaults to auto-discovery.")
}
