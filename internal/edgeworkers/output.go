package edgeworkers

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/Automattic/vip/internal/output"
)

func EscapeTerminalText(s string) string {
	var out strings.Builder
	for _, r := range s {
		if r <= 31 || r >= 127 && r <= 159 {
			fmt.Fprintf(&out, `\u%04x`, r)
		} else {
			out.WriteRune(r)
		}
	}
	return out.String()
}
func locationText(location *Location, escape func(string) string) string {
	if location == nil {
		return "all requests"
	}
	return escape(location.Operator) + ` "` + escape(location.Value) + `"`
}
func activeLabel(active bool) string {
	if active {
		return "active"
	}
	return "inactive"
}
func ListRows(workers []Worker, format string) output.OrderedRows {
	escape := EscapeTerminalText
	if format == "json" {
		escape = func(s string) string { return s }
	}
	rows := make(output.OrderedRows, 0, len(workers))
	for _, w := range workers {
		phases := make([]string, len(w.Phases))
		for i, p := range w.Phases {
			phases[i] = escape(p)
		}
		active := "no"
		if w.Active {
			active = "yes"
		}
		rows = append(rows, output.OrderedRow{{Key: "id", Value: w.ID}, {Key: "name", Value: escape(w.Name)}, {Key: "active", Value: active}, {Key: "phases", Value: strings.Join(phases, ", ")}, {Key: "location", Value: locationText(w.Location, escape)}, {Key: "on_failure", Value: escape(w.OnFailure)}, {Key: "modified", Value: escape(w.UpdatedAt)}})
	}
	return rows
}
func DetailText(w Worker, source bool) string {
	active := "no"
	if w.Active {
		active = "yes"
	}
	text := output.KeyValue([]output.Tuple{{Key: "ID", Value: strconv.FormatInt(w.ID, 10)}, {Key: "Name", Value: EscapeTerminalText(w.Name)}, {Key: "Active", Value: active}, {Key: "Phases", Value: escapedJoin(w.Phases, ", ", "")}, {Key: "Location", Value: locationText(w.Location, EscapeTerminalText)}, {Key: "On failure", Value: EscapeTerminalText(w.OnFailure)}, {Key: "Created", Value: EscapeTerminalText(w.CreatedAt)}, {Key: "Modified", Value: EscapeTerminalText(w.UpdatedAt)}})
	if source {
		value := "(no source stored)"
		if w.Source != nil {
			value = EscapeTerminalText(*w.Source)
		}
		text += "\n\nSource:\n" + value
	}
	return text
}
func PlanRows(items []PlanItem) output.OrderedRows {
	rows := make(output.OrderedRows, 0, len(items))
	for _, item := range items {
		current := "new"
		if item.Existing != nil {
			current = activeLabel(item.Existing.Active)
		}
		rows = append(rows, output.OrderedRow{{Key: "worker", Value: EscapeTerminalText(item.Worker.Manifest.Name)}, {Key: "action", Value: item.Action}, {Key: "current_active", Value: current}, {Key: "final_active", Value: activeLabel(item.IntendedActive)}, {Key: "current_scope", Value: locationText(item.CurrentLocation, EscapeTerminalText)}, {Key: "proposed_scope", Value: locationText(item.ProposedLocation, EscapeTerminalText)}, {Key: "validation", Value: item.Validation}, {Key: "phases", Value: escapedJoin(item.Phases, ", ", "none")}, {Key: "bytes", Value: strconv.FormatInt(item.Artifact.SizeBytes, 10)}, {Key: "source", Value: item.SourceMode}})
	}
	return rows
}
func AppliedMessage(item PlanItem, w Worker) string {
	name := EscapeTerminalText(item.Worker.Manifest.Name)
	result := ""
	if item.Action == "create" {
		result = fmt.Sprintf("created \"%s\"; inactive", name)
		if w.Active {
			result = fmt.Sprintf("created \"%s\" and enabled it", name)
		}
	} else if w.Active {
		result = fmt.Sprintf("updated \"%s\" and enabled it", name)
		if item.Existing != nil && item.Existing.Active {
			result = fmt.Sprintf("updated \"%s\"; remains active", name)
		}
	} else {
		result = fmt.Sprintf("updated \"%s\"; remains inactive", name)
	}
	return fmt.Sprintf("✓ %s (%d bytes, phases: %s)", result, item.Artifact.SizeBytes, escapedJoin(w.Phases, ", ", "none"))
}
func InactiveCreateGuidance(names []string) string {
	quoted := make([]string, len(names))
	for i, name := range names {
		quoted[i] = `"` + EscapeTerminalText(name) + `"`
	}
	joined := strings.Join(quoted, ", ")
	if len(names) == 1 {
		return fmt.Sprintf("Review created inactive edge worker %s, then run `vip edge-workers enable <name>` when ready.", joined)
	}
	return fmt.Sprintf("Review created inactive edge workers %s, then run `vip edge-workers enable <name>` for each one when ready.", joined)
}
func PartialFailureMessage(e *ApplyError) string {
	cause := EscapeTerminalText(e.Error())
	name := EscapeTerminalText(e.FailedName)
	if e.Stage == "enable" {
		active := "unknown"
		if e.ActiveAfterUpload != nil {
			active = activeLabel(*e.ActiveAfterUpload)
		}
		return fmt.Sprintf("Deployment uploaded \"%s\" and its last confirmed state was %s, but the enable request failed. Final active state is unknown; verify with `vip edge-workers get %s` or `vip edge-workers list`. Completed: %s. Not attempted: %s. Cause: %s", name, active, name, escapedJoin(e.AppliedNames, ", ", "none"), escapedJoin(e.UnappliedNames, ", ", "none"), cause)
	}
	return fmt.Sprintf("Deployment stopped at \"%s\". Applied: %s. Not applied: %s. Cause: %s", name, escapedJoin(e.AppliedNames, ", ", "none"), escapedJoin(e.UnappliedNames, ", ", "none"), cause)
}
