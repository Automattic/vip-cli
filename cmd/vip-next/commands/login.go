package commands

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
)

// trackerAdapter adapts the package trackEvent helper to auth.Tracker.
type trackerAdapter struct{ track func(string, map[string]any) }

func (a trackerAdapter) Track(name string, props map[string]any) {
	if a.track != nil {
		a.track(name, props)
	}
}

// LoginCmd returns `vip login`. Node parity: src/bin/vip.js runLoginFlow
// (the flow lives in internal/auth/login.go and is already tested). login is
// on the auth-bypass list, so it builds its own Store + tracker.
func LoginCmd() *cobra.Command {
	return &cobra.Command{
		Use:           "login",
		Short:         "Authenticate VIP-CLI with a Personal Access Token",
		Long:          "Authenticate your installation of VIP-CLI with your Personal Access Token.",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg := GetConfig()
			store := auth.NewStore(keychain.New(cfg.APIHost))

			var alias func(int64)
			if cfg.Tracker != nil {
				alias = cfg.Tracker.AliasUser
			}
			flow := auth.NewProductionLoginFlow(store, trackerAdapter{track: trackEvent}, alias)

			if _, err := flow.Run(); err != nil {
				// Node parity: cancel + printed validation failures end the command
				// without a non-zero exit (the flow already printed the message).
				// Only unexpected errors (keychain Save, prompt I/O) surface as exit 1.
				if errors.Is(err, auth.ErrLoginCancelled) || auth.IsHandledLoginError(err) {
					return nil
				}
				return err
			}
			return nil
		},
	}
}
