package commands

import (
	"errors"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/searchreplace"
)

// SearchReplaceCmd returns `vip search-replace <file>`. Node parity:
// src/bin/vip-search-replace.js. Reuses internal/searchreplace.Run (built for
// import sql). Unlike the import path, standalone defaults output to STDOUT.
func SearchReplaceCmd() *cobra.Command {
	var pairs []string
	var inPlace bool
	var output string
	cmd := &cobra.Command{
		Use:           "search-replace <file>",
		Short:         "Search and replace strings in a local file",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) < 1 || args[0] == "" {
				return errors.New("You must pass in a filename")
			}
			if len(pairs) == 0 {
				return errors.New("You must provide a pair of strings (separated by comma) such as original,replacement")
			}
			// Node prompts before an in-place rewrite and defaults to No
			// (search-and-replace.ts:151); the standalone bin passes no
			// batchMode (vip-search-replace.js:74), so this path always asks.
			// Declining exits 0 with the file untouched, matching Node's bare
			// process.exit(). A context that cannot prompt is refused outright
			// rather than proceeding silently or hanging.
			if inPlace {
				approved, err := appctx.Confirm(cmd, searchreplace.InPlaceConfirmMessage, false)
				if err != nil {
					return err
				}
				if !approved {
					return nil
				}
			}
			res, err := searchreplace.Run(args[0], pairs, searchreplace.Options{InPlace: inPlace, Output: output})
			if err != nil {
				return err
			}
			// Stdout default: neither --in-place nor --output → stream the result
			// file to stdout and remove the temp file (Node: "output to STDOUT by
			// default").
			if !inPlace && output == "" {
				f, err := os.Open(res.OutputFileName)
				if err != nil {
					return err
				}
				defer f.Close()
				defer os.Remove(res.OutputFileName)
				if _, err := io.Copy(cmd.OutOrStdout(), f); err != nil {
					return err
				}
			}
			return nil
		},
	}
	cmd.Flags().StringArrayVarP(&pairs, "search-replace", "s", nil, `A comma-separated pair of strings (e.g. --search-replace="from,to").`)
	cmd.Flags().BoolVarP(&inPlace, "in-place", "i", false, "Overwrite the local input file with the results.")
	cmd.Flags().StringVarP(&output, "output", "o", "", "Local file path to save the results (ignored with --in-place).")
	return cmd
}
