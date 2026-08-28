package commands

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/edgeworkers"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"golang.org/x/term"
)

type edgeWorkersDeps struct {
	Getwd         func() (string, error)
	Service       edgeworkers.Service
	Confirm       func(*cobra.Command, string, bool) (bool, error)
	IsInteractive func(*cobra.Command) bool
	StdoutTTY     func(*cobra.Command) bool
}

func NewEdgeWorkersCmd() *cobra.Command {
	return newEdgeWorkersCmd(edgeWorkersDeps{Service: edgeworkers.Service{API: edgeworkers.APIClient{Client: GetConfig().GQLClient}, Builder: edgeworkers.Compiler{}}})
}
func newEdgeWorkersCmd(deps edgeWorkersDeps) *cobra.Command {
	if deps.Getwd == nil {
		deps.Getwd = os.Getwd
	}
	if deps.Confirm == nil {
		deps.Confirm = appctx.Confirm
	}
	if deps.IsInteractive == nil {
		deps.IsInteractive = appctx.IsInteractive
	}
	if deps.StdoutTTY == nil {
		deps.StdoutTTY = func(c *cobra.Command) bool {
			f, ok := c.OutOrStdout().(*os.File)
			return ok && term.IsTerminal(int(f.Fd()))
		}
	}
	c := &cobra.Command{Use: "edge-workers", Short: "Manage edge workers for an environment.", RunE: func(c *cobra.Command, _ []string) error { return c.Help() }}
	// NUL distinguishes a bare optional flag from the literal string "true".
	// It is parser state, not a display default; do not let pflag emit it.
	defaultHelp := c.HelpFunc()
	c.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		var marked []*pflag.Flag
		cmd.Flags().VisitAll(func(flag *pflag.Flag) {
			if flag.NoOptDefVal == edgeWorkersBareValue {
				marked = append(marked, flag)
				flag.NoOptDefVal = ""
			}
		})
		defer func() {
			for _, flag := range marked {
				flag.NoOptDefVal = edgeWorkersBareValue
			}
		}()
		defaultHelp(cmd, args)
	})
	c.AddCommand(newEdgeWorkersInitCmd(deps), newEdgeWorkersNewCmd(deps), newEdgeWorkersBuildCmd(deps), newEdgeWorkersListCmd(deps), newEdgeWorkersGetCmd(deps), newEdgeWorkersValidateCmd(deps), newEdgeWorkersDeployCmd(deps), newEdgeWorkersLifecycleCmd(deps, "enable"), newEdgeWorkersLifecycleCmd(deps, "disable"), newEdgeWorkersLifecycleCmd(deps, "delete"))
	return c
}
func edgeWorkersTrack(c *cobra.Command, event string, props map[string]any) {
	p := map[string]any{}
	for k, v := range props {
		p[k] = v
	}
	if ae := appctx.FromContext(c.Context()); ae != nil {
		p["app_id"] = ae.App.ID
		p["env_id"] = ae.Env.ID
	}
	trackEvent("edge_workers_"+event, p)
}
func edgeName(args []string) string {
	if len(args) > 0 {
		return args[0]
	}
	return ""
}
func edgeNameProps(args []string) map[string]any {
	p := map[string]any{}
	if len(args) > 0 {
		p["name"] = args[0]
	}
	return p
}
func edgeBool(c *cobra.Command, name string) bool { v, _ := c.Flags().GetBool(name); return v }
func edgeError(c *cobra.Command, action string, args []string, err error) error {
	var apiErr *edgeworkers.APIError
	if errors.As(err, &apiErr) {
		for _, message := range apiErr.Messages {
			fmt.Fprintf(c.ErrOrStderr(), "Error: %s\n", edgeworkers.EscapeTerminalText(message))
		}
	}
	p := edgeNameProps(args)
	p["error"] = action + "_failed"
	edgeWorkersTrack(c, action+"_command_error", p)
	var partial *edgeworkers.ApplyError
	if errors.As(err, &partial) {
		return errors.New(edgeworkers.PartialFailureMessage(partial))
	}
	message := edgeworkers.EscapeTerminalText(err.Error())
	if action == "init" || action == "new" || action == "build" {
		return errors.New(message)
	}
	noun := "edge worker"
	if action == "list" {
		noun = "edge workers"
	}
	return fmt.Errorf("Failed to %s %s: %s", action, noun, message)
}
func edgeProject(deps edgeWorkersDeps, path *edgeWorkersStringFlag) (string, error) {
	cwd, err := deps.Getwd()
	if err != nil {
		return "", err
	}
	var explicit *string
	if len(path.Values) > 0 {
		v, ok := edgeWorkersOptionValue(path).(string)
		if !ok {
			return "", errors.New("The --path flag requires a path to the edge-workers project.")
		}
		explicit = &v
	}
	return edgeworkers.ResolveProjectDir(cwd, explicit)
}
func edgeSelect(deps edgeWorkersDeps, c *cobra.Command, args []string, path *edgeWorkersStringFlag, action string) (string, []edgeworkers.LocalWorker, error) {
	name := edgeName(args)
	all := edgeBool(c, "all")
	if name != "" && all {
		return "", nil, errors.New("Supply either a worker name or --all, not both.")
	}
	dir, err := edgeProject(deps, path)
	if err != nil {
		return "", nil, err
	}
	if name != "" {
		w, err := edgeworkers.FindWorker(dir, name)
		if err != nil {
			return "", nil, err
		}
		return dir, []edgeworkers.LocalWorker{w}, nil
	}
	if !all && action != "build" {
		return "", nil, fmt.Errorf("Please supply a worker name to %s, or pass `--all`.", action)
	}
	workers, err := edgeworkers.DiscoverWorkers(dir)
	if err != nil {
		return "", nil, err
	}
	if len(workers) == 0 {
		message := "No workers found in this project."
		if action == "build" {
			message += " Create one with `vip edge-workers new`."
		}
		return "", nil, errors.New(message)
	}
	return dir, workers, nil
}
func edgeRemote(c *cobra.Command, required bool, handler appctx.RunFunc) *cobra.Command {
	addAppEnvFlags(c)
	mw := []appctx.Middleware{appctx.WithAppContext(GetConfig().AppCtxConfig), appctx.WithEnvContext()}
	if required {
		mw = append(mw, appctx.WithRequiredArgs(1))
	}
	return appctx.Build(c, mw...).WithRun(handler)
}
func edgeConfirm(deps edgeWorkersDeps, c *cobra.Command) func(string) (bool, error) {
	return func(message string) (bool, error) {
		ok, err := deps.Confirm(c, message, false)
		if errors.Is(err, appctx.ErrNonInteractive) {
			return false, nil
		}
		return ok, err
	}
}
func edgeProduction(deps edgeWorkersDeps, c *cobra.Command, action string, names []string, enable bool) error {
	ae := appctx.FromContext(c.Context())
	return edgeworkers.ConfirmProduction(edgeworkers.ProductionConfirmation{Action: action, AppName: ae.App.Name, EnvType: ae.Env.Type, WorkerNames: names, EnableAfterDeploy: enable, SkipConfirmation: edgeBool(c, "skip-confirmation"), NonInteractive: !deps.IsInteractive(c) || !deps.StdoutTTY(c)}, edgeConfirm(deps, c))
}
func edgeArtifact(deps edgeWorkersDeps, c *cobra.Command, dir string, w edgeworkers.LocalWorker) (edgeworkers.Artifact, error) {
	if edgeBool(c, "skip-build") {
		return edgeworkers.ReadPrebuilt(dir, w)
	}
	if deps.Service.Builder == nil {
		return edgeworkers.Artifact{}, errors.New("No worker compiler configured.")
	}
	return deps.Service.Builder.Build(c.Context(), dir, w)
}
func edgeAbs(cwd, target string) string {
	if filepath.IsAbs(target) {
		return filepath.Clean(target)
	}
	return filepath.Join(cwd, target)
}
