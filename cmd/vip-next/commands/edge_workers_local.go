package commands

import (
	"errors"
	"fmt"
	"path/filepath"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/edgeworkers"
	"github.com/spf13/cobra"
)

func newEdgeWorkersInitCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "init [path]", Short: "Scaffold a new edge-workers project.", Example: "  vip edge-workers init\n  vip edge-workers init ./infra/edge --type=assemblyscript"}
	kind := edgeStringFlag(c, "type", "t", `The worker toolchain to scaffold. Accepts assemblyscript. Default is "assemblyscript".`)
	c.RunE = func(c *cobra.Command, args []string) error {
		value := edgeWorkersOptionValue(kind)
		kindString, isString := value.(string)
		if value == nil || isString && kindString == "" {
			value = "assemblyscript"
		}
		kindText := edgeOptionText(value)
		props := map[string]any{"type": value}
		edgeWorkersTrack(c, "init_command_execute", props)
		if text, ok := value.(string); !ok || text != "assemblyscript" {
			edgeWorkersTrack(c, "init_command_error", map[string]any{"type": value, "error": "Unsupported type"})
			return fmt.Errorf("Unsupported type \"%s\". Supported types: assemblyscript.", edgeworkers.EscapeTerminalText(kindText))
		}
		cwd, err := deps.Getwd()
		if err != nil {
			return edgeError(c, "init", args, err)
		}
		target := edgeName(args)
		if target == "" {
			target = edgeworkers.ConventionalDir
		}
		dir := edgeAbs(cwd, target)
		if err := edgeworkers.ScaffoldProject(dir, kindText); err != nil {
			edgeWorkersTrack(c, "init_command_error", map[string]any{"type": value, "error": "init_failed"})
			return errors.New(edgeworkers.EscapeTerminalText(err.Error()))
		}
		edgeWorkersTrack(c, "init_command_success", props)
		_, err = fmt.Fprintf(c.OutOrStdout(), "✓ Created a new %s edge-workers project in %s\n\nNext steps:\n  cd %s\n  npm install\n  vip edge-workers new my-worker\n", kindText, edgeworkers.EscapeTerminalText(dir), edgeworkers.EscapeTerminalText(target))
		return err
	}
	return c
}
func newEdgeWorkersNewCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "new <name>", Short: "Add a new worker to an edge-workers project.", Example: "  vip edge-workers new add-security-headers\n  vip edge-workers new my-worker --path ./infra/edge\n  vip edge-workers new api-auth --location starts_with:/api/"}
	path := edgePathFlag(c)
	location := edgeStringFlag(c, "location", "l", `Only run the worker on matching request paths, as "<operator>:<value>". Operators: `+edgeworkers.LocationOperators+".")
	return appctx.Build(c, appctx.WithRequiredArgs(1)).WithRun(func(c *cobra.Command, args []string) error {
		name := edgeName(args)
		edgeWorkersTrack(c, "new_command_execute", edgeNameProps(args))
		run := func() error {
			if err := edgeworkers.ValidateWorkerName(name, "worker name"); err != nil {
				return err
			}
			var loc *edgeworkers.Location
			if value := edgeWorkersOptionValue(location); value != nil {
				raw, ok := value.(string)
				if !ok {
					return errors.New("The --location flag requires a value in the form \"<operator>:<value>\" (e.g. \"starts_with:/api/\"). Operators: " + edgeworkers.LocationOperators + ".")
				}
				parsed, err := edgeworkers.ParseLocationOption(raw)
				if err != nil {
					return err
				}
				loc = &parsed
			}
			dir, err := edgeProject(deps, path)
			if err != nil {
				return err
			}
			descriptor, err := edgeworkers.ReadProjectDescriptor(dir)
			if err != nil {
				return err
			}
			if err := edgeworkers.ScaffoldWorker(dir, name, loc); err != nil {
				return err
			}
			edgeWorkersTrack(c, "new_command_success", map[string]any{"name": name, "type": descriptor.Type})
			fmt.Fprintf(c.OutOrStdout(), "✓ Created worker \"%s\" in %s\n", edgeworkers.EscapeTerminalText(name), edgeworkers.EscapeTerminalText(filepath.Join(dir, edgeworkers.WorkersDir, name)))
			if loc == nil {
				fmt.Fprintln(c.OutOrStdout(), "Scope: all requests. Set location in worker.json before deployment to narrow it.")
			} else {
				fmt.Fprintf(c.OutOrStdout(), "Scope: %s \"%s\".\n", edgeworkers.EscapeTerminalText(loc.Operator), edgeworkers.EscapeTerminalText(loc.Value))
			}
			_, err = fmt.Fprintf(c.OutOrStdout(), "\nEdit the worker, then deploy it with:\n  vip @my-site.develop edge-workers deploy %s\n", edgeworkers.EscapeTerminalText(name))
			return err
		}
		if err := run(); err != nil {
			return edgeError(c, "new", args, err)
		}
		return nil
	})
}
func newEdgeWorkersBuildCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "build [name]", Short: "Compile worker(s) to WebAssembly locally.", Example: "  vip edge-workers build\n  vip edge-workers build my-worker"}
	path := edgePathFlag(c)
	c.Flags().BoolP("all", "a", false, "Compile every worker in the project.")
	c.RunE = func(c *cobra.Command, args []string) error {
		props := edgeNameProps(args)
		props["all"] = edgeBool(c, "all")
		edgeWorkersTrack(c, "build_command_execute", props)
		dir, workers, err := edgeSelect(deps, c, args, path, "build")
		if err != nil {
			return edgeError(c, "build", args, err)
		}
		for _, w := range workers {
			art, err := edgeArtifact(deps, c, dir, w)
			if err != nil {
				return edgeError(c, "build", args, err)
			}
			relative, err := filepath.Rel(dir, art.Path)
			if err != nil {
				return edgeError(c, "build", args, err)
			}
			if _, err := fmt.Fprintf(c.OutOrStdout(), "✓ Built \"%s\" → %s (%d bytes)\n", edgeworkers.EscapeTerminalText(w.Manifest.Name), edgeworkers.EscapeTerminalText(relative), art.SizeBytes); err != nil {
				return err
			}
		}
		edgeWorkersTrack(c, "build_command_success", map[string]any{"count": len(workers)})
		return nil
	}
	return c
}
