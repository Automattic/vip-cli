package commands

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/rechallenge"
)

// LogoutCmd returns `vip logout`. logout is on the auth-bypass list, so it
// loads and purges vip-next's token itself. Server-side invalidation is
// best-effort and never uses the read-only Node-token fallback; local purge and
// elevated-cache clear always run.
func LogoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:           "logout",
		Short:         "Log out the current authenticated VIP-CLI user",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg := GetConfig()
			k := keychain.New(cfg.APIHost)
			store := auth.NewStore(k)

			if raw, err := store.LoadPrimary(); err == nil && raw != "" {
				_ = auth.PostLogout(cfg.APIHost, raw)
			}
			if err := store.Delete(); err != nil && !errors.Is(err, auth.ErrNoToken) {
				return err
			}
			elevated := &keychain.Keychain{Backend: k.Backend, Service: rechallenge.ServiceNameForHost(cfg.APIHost)}
			_ = (&rechallenge.TokenCache{Keychain: elevated}).ClearAll()

			trackEvent("logout_command_execute", nil)
			fmt.Fprintln(cmd.OutOrStdout(), "You are now logged out.")
			return nil
		},
	}
}
