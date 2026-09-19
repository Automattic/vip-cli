package commands

import (
	"fmt"
	"strings"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/edgeworkers"
	"github.com/spf13/cobra"
)

func newEdgeWorkersListCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "list", Short: "List the edge workers deployed to an environment.", Example: "  vip-next @example-app.production edge-workers list"}
	addFormatFlagWithShort(c)
	return buildAppEnvRenderableCmd(c, "table", []string{"table", "csv", "json"}, func(c *cobra.Command, args []string) (any, error) {
		edgeWorkersTrack(c, "list_command_execute", nil)
		ae := appctx.FromContext(c.Context())
		workers, err := deps.Service.API.List(c.Context(), ae.App.ID, ae.Env.ID)
		if err != nil {
			return nil, edgeError(c, "list", nil, err)
		}
		edgeWorkersTrack(c, "list_command_success", map[string]any{"count": len(workers)})
		format := string(appctx.FormatFromContext(c.Context()))
		if len(workers) == 0 && format != "json" {
			fmt.Fprintln(c.OutOrStdout(), "No edge workers are deployed to this environment.")
			// Node console.logs the empty formatted result as well.
			fmt.Fprintln(c.OutOrStdout())
		}
		return edgeworkers.ListRows(workers, format), nil
	})
}
func newEdgeWorkersGetCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "get <name>", Short: "Retrieve details for a single deployed edge worker.", Example: "  vip-next @example-app.production edge-workers get my-worker\n  vip-next @example-app.production edge-workers get my-worker --source"}
	c.Flags().BoolP("source", "s", false, "Print the stored source code for the worker.")
	return edgeRemote(c, true, func(c *cobra.Command, args []string) error {
		props := edgeNameProps(args)
		edgeWorkersTrack(c, "get_command_execute", props)
		ae := appctx.FromContext(c.Context())
		source := edgeBool(c, "source")
		name := edgeName(args)
		w, err := deps.Service.API.Get(c.Context(), ae.App.ID, ae.Env.ID, name, source)
		if err != nil {
			return edgeError(c, "get", args, err)
		}
		if w == nil {
			edgeWorkersTrack(c, "get_command_error", map[string]any{"name": name, "error": "Not found"})
			return fmt.Errorf("No edge worker named \"%s\" is deployed to this environment.", edgeworkers.EscapeTerminalText(name))
		}
		edgeWorkersTrack(c, "get_command_success", props)
		_, err = fmt.Fprintln(c.OutOrStdout(), edgeworkers.DetailText(*w, source))
		return err
	})
}
func newEdgeWorkersValidateCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "validate [name]", Short: "Validate worker(s) against an environment without deploying.", Example: "  vip-next @example-app.develop edge-workers validate my-worker\n  vip-next @example-app.develop edge-workers validate --all\n  vip-next @example-app.develop edge-workers validate my-worker --skip-build"}
	path := edgePathFlag(c)
	c.Flags().Bool("all", false, "Validate every worker in the project.")
	c.Flags().BoolP("skip-build", "s", false, "Validate a previously compiled artifact without recompiling.")
	return edgeRemote(c, false, func(c *cobra.Command, args []string) error {
		props := edgeNameProps(args)
		props["all"] = edgeBool(c, "all")
		edgeWorkersTrack(c, "validate_command_execute", props)
		dir, workers, err := edgeSelect(deps, c, args, path, "validate")
		if err != nil {
			return edgeError(c, "validate", args, err)
		}
		ae := appctx.FromContext(c.Context())
		invalid := 0
		for _, w := range workers {
			art, err := edgeArtifact(deps, c, dir, w)
			if err != nil {
				return edgeError(c, "validate", args, err)
			}
			result, err := deps.Service.API.Validate(c.Context(), ae.Env.ID, art.Base64)
			if err != nil {
				return edgeError(c, "validate", args, err)
			}
			if !result.Valid {
				invalid++
				details := edgeJoin(result.Errors, "; ", "unknown error")
				fmt.Fprintf(c.OutOrStdout(), "✕ \"%s\" is invalid: %s\n", edgeworkers.EscapeTerminalText(w.Manifest.Name), details)
			} else {
				fmt.Fprintf(c.OutOrStdout(), "✓ \"%s\" is valid (phases: %s)\n", edgeworkers.EscapeTerminalText(w.Manifest.Name), edgeJoin(result.Phases, ", ", "none"))
			}
		}
		if invalid > 0 {
			return edgeError(c, "validate", args, fmt.Errorf("%d worker(s) failed validation.", invalid))
		}
		edgeWorkersTrack(c, "validate_command_success", map[string]any{"count": len(workers), "invalid": invalid})
		return nil
	})
}
func edgeJoin(values []string, sep, fallback string) string {
	parts := make([]string, len(values))
	for i, s := range values {
		parts[i] = edgeworkers.EscapeTerminalText(s)
	}
	s := strings.Join(parts, sep)
	if s == "" {
		return fallback
	}
	return s
}
