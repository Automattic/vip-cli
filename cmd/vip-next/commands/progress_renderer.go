package commands

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/Automattic/vip/internal/tui"
)

// frameSource is anything that can render its current state as a
// multi-line frame. Implemented by *tui.ProgressTracker (imports, backup,
// deploy, export, dev-env sync) and *mediaimport.Tracker (import media).
type frameSource interface {
	Frame() string
}

// importProgressRenderer ticks the tracker frame onto stderr on a TTY
// (PRINT_INTERVAL = 200ms; 5000ms under --debug — progress.ts:6). On
// non-TTY nothing is animated; the final frame prints once at the end.
type importProgressRenderer struct {
	src      frameSource
	renderer *tui.MultiLineRenderer
	done     chan struct{}
	loopDone sync.WaitGroup // signals the ticker goroutine has fully exited
	stopped  bool
}

func startImportProgressRenderer(cmd *cobra.Command, src frameSource) *importProgressRenderer {
	return startProgressRenderer(cmd, src, os.Stderr, term.IsTerminal(int(os.Stderr.Fd())))
}

// startBackupProgressRenderer keeps progress and the success message on
// stdout, matching Node's progress.ts + backup-db.ts stream contract. Other
// heavy commands retain their existing TTY-on-stderr policy.
func startBackupProgressRenderer(cmd *cobra.Command, src frameSource) *importProgressRenderer {
	out := cmd.OutOrStdout()
	tty := false
	if f, ok := out.(interface{ Fd() uintptr }); ok {
		tty = term.IsTerminal(int(f.Fd()))
	}
	return startProgressRenderer(cmd, src, out, tty)
}

func startProgressRenderer(cmd *cobra.Command, src frameSource, animatedOut io.Writer, tty bool) *importProgressRenderer {
	r := &importProgressRenderer{src: src, done: make(chan struct{})}
	if !tty {
		return r
	}
	r.renderer = tui.NewMultiLineRenderer(animatedOut, true)
	interval := 200 * time.Millisecond
	if f := cmd.Flag("debug"); f != nil && f.Changed {
		interval = 5 * time.Second
	}
	r.loopDone.Add(1)
	go func() {
		defer r.loopDone.Done()
		tk := time.NewTicker(interval)
		defer tk.Stop()
		for {
			select {
			case <-r.done:
				return
			case <-tk.C:
				r.renderer.Render(strings.Split(strings.TrimRight(r.src.Frame(), "\n"), "\n"))
			}
		}
	}()
	return r
}

// stop halts the ticker. final=true renders one last frame (TTY) or — on
// non-TTY — prints the frame once to stdout so scripted runs still see
// the terminal state (the sync non-TTY precedent: render on transition
// only; here the single final frame is the stable output).
func (r *importProgressRenderer) stop(cmd *cobra.Command, final bool) {
	r.stopWithTrailingBlank(cmd, final, true)
}

// stopCompact is the backup-db variant: Node prints the success message on
// the line immediately after the final progress frame, without the blank line
// used by import command framing.
func (r *importProgressRenderer) stopCompact(cmd *cobra.Command, final bool) {
	r.stopWithTrailingBlank(cmd, final, false)
}

func (r *importProgressRenderer) stopWithTrailingBlank(cmd *cobra.Command, final, trailingBlank bool) {
	if r.stopped {
		return
	}
	r.stopped = true
	close(r.done)
	if r.renderer != nil {
		// Wait for the ticker goroutine to fully exit before the final
		// frame: otherwise it could be mid-Render (a data race on the
		// shared renderer) and its stray frame would land below ours,
		// duplicating the top line. Mirrors ttyRenderer (sync_render.go).
		r.loopDone.Wait()
		if final {
			r.renderer.Render(strings.Split(strings.TrimRight(r.src.Frame(), "\n"), "\n"))
		}
		r.renderer.Done()
		return
	}
	if final {
		frame := r.src.Frame()
		fmt.Fprint(cmd.OutOrStdout(), frame)
		if trailingBlank || !strings.HasSuffix(frame, "\n") {
			fmt.Fprintln(cmd.OutOrStdout())
		}
	}
}
