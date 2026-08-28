package commands

import (
	"fmt"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/edgeworkers"
	"github.com/Automattic/vip/internal/output"
	"github.com/spf13/cobra"
)

func newEdgeWorkersDeployCmd(deps edgeWorkersDeps) *cobra.Command {
	c := &cobra.Command{Use: "deploy [name]", Short: "Compile and deploy a worker to an environment.", Example: "  vip @example-app.develop edge-workers deploy my-worker\n  vip @example-app.develop edge-workers deploy --all\n  vip @example-app.develop edge-workers deploy my-worker --skip-build"}
	path := edgePathFlag(c)
	c.Flags().Bool("all", false, "Deploy every worker in the project.")
	c.Flags().BoolP("skip-build", "s", false, "Deploy a previously compiled artifact without recompiling.")
	c.Flags().Bool("skip-validate", false, "Skip server-side dry-run validation before uploading.")
	c.Flags().Bool("skip-source", false, "Do not store source on create; preserve stored source on update.")
	c.Flags().Bool("enable", false, "Enable each deployed worker after a successful upload.")
	c.Flags().Bool("skip-confirmation", false, "Skip the production deployment confirmation.")
	return edgeRemote(c, false, func(c *cobra.Command, args []string) error {
		props := edgeNameProps(args)
		props["all"] = edgeBool(c, "all")
		edgeWorkersTrack(c, "deploy_command_execute", props)
		run := func() error {
			dir, workers, err := edgeSelect(deps, c, args, path, "deploy")
			if err != nil {
				return err
			}
			ae := appctx.FromContext(c.Context())
			enable := edgeBool(c, "enable")
			plan, err := deps.Service.PreparePlan(c.Context(), edgeworkers.PlanOptions{AppID: ae.App.ID, EnvID: ae.Env.ID, ProjectDir: dir, Workers: workers, SkipBuild: edgeBool(c, "skip-build"), SkipValidate: edgeBool(c, "skip-validate"), SkipSource: edgeBool(c, "skip-source"), Enable: enable})
			if err != nil {
				return err
			}
			if _, err := fmt.Fprintln(c.OutOrStdout(), output.TableString(edgeworkers.PlanRows(plan))); err != nil {
				return err
			}
			names := make([]string, len(plan))
			for i, item := range plan {
				names[i] = item.Worker.Manifest.Name
			}
			if err := edgeProduction(deps, c, "deploy", names, enable); err != nil {
				return err
			}
			inactive := []string{}
			activeCount := 0
			err = deps.Service.ApplyPlan(c.Context(), ae.Env.ID, plan, func(item edgeworkers.PlanItem, result edgeworkers.Worker) error {
				if !enable && item.Action == "create" && !result.Active {
					inactive = append(inactive, item.Worker.Manifest.Name)
				}
				if result.Active {
					activeCount++
				}
				_, err := fmt.Fprintln(c.OutOrStdout(), edgeworkers.AppliedMessage(item, result))
				return err
			})
			if err != nil {
				return err
			}
			if len(inactive) > 0 {
				if _, err := fmt.Fprintln(c.OutOrStdout(), edgeworkers.InactiveCreateGuidance(inactive)); err != nil {
					return err
				}
			}
			edgeWorkersTrack(c, "deploy_command_success", map[string]any{"count": len(plan), "enable": enable, "activeCount": activeCount})
			return nil
		}
		if err := run(); err != nil {
			return edgeError(c, "deploy", args, err)
		}
		return nil
	})
}
func newEdgeWorkersLifecycleCmd(deps edgeWorkersDeps, action string) *cobra.Command {
	verb := map[string]string{"enable": "Enable", "disable": "Disable", "delete": "Permanently delete"}[action]
	c := &cobra.Command{Use: action + " <name>", Short: verb + " a deployed edge worker.", Example: "  vip @example-app.production edge-workers " + action + " my-worker"}
	if action == "enable" {
		c.Flags().BoolP("skip-confirmation", "s", false, "Skip the production enable confirmation.")
	}
	if action == "delete" {
		c.Flags().BoolP("force", "f", false, "Skip confirmation.")
	}
	return edgeRemote(c, true, func(c *cobra.Command, args []string) error {
		props := edgeNameProps(args)
		edgeWorkersTrack(c, action+"_command_execute", props)
		name := edgeName(args)
		run := func() error {
			ae := appctx.FromContext(c.Context())
			workers, err := deps.Service.API.List(c.Context(), ae.App.ID, ae.Env.ID)
			if err != nil {
				return err
			}
			var worker *edgeworkers.Worker
			for i := range workers {
				if workers[i].Name == name {
					worker = &workers[i]
					break
				}
			}
			if worker == nil {
				return fmt.Errorf("No edge worker named \"%s\" is deployed to this environment.", name)
			}
			if action == "enable" {
				if err := edgeProduction(deps, c, "enable", []string{worker.Name}, false); err != nil {
					return err
				}
			}
			if action == "delete" {
				if err := edgeworkers.ConfirmDeletion(ae.App.Name, ae.Env.Type, worker.Name, edgeBool(c, "force"), edgeConfirm(deps, c)); err != nil {
					return err
				}
				err = deps.Service.API.Delete(c.Context(), ae.Env.ID, worker.ID)
			} else {
				_, err = deps.Service.API.SetActive(c.Context(), ae.Env.ID, worker.ID, action == "enable")
			}
			if err != nil {
				return err
			}
			edgeWorkersTrack(c, action+"_command_success", props)
			past := map[string]string{"enable": "Enabled", "disable": "Disabled", "delete": "Deleted"}[action]
			_, err = fmt.Fprintf(c.OutOrStdout(), "✓ %s edge worker \"%s\".\n", past, edgeworkers.EscapeTerminalText(name))
			return err
		}
		if err := run(); err != nil {
			return edgeError(c, action, args, err)
		}
		return nil
	})
}
