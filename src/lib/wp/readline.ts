/**
 * Safe wrappers around `readline.Interface` lifecycle methods.
 *
 * On Node.js >= 24, calling `resume()`, `pause()`, `prompt()`, or `write()` on a
 * readline interface that has already been closed throws
 * `Error [ERR_USE_AFTER_CLOSE]: readline was closed`. On Node 20/22 the same
 * calls are silent no-ops.
 *
 * `vip wp` drives non-interactive, one-shot commands through a readline
 * interface bound to `process.stdin`. When stdin is redirected from
 * `/dev/null` (no TTY, e.g. CI or container runs) the interface receives EOF
 * immediately and closes, while the command keeps streaming output. On a
 * websocket reconnect during a long-running command the reconnect handler then
 * calls `resume()` on the already-closed interface, crashing the process on
 * Node 24.
 *
 * These helpers guard every such call so the interface is only driven while it
 * is still open. Closure is tracked through the documented `'close'` event
 * rather than any internal interface property, so the behaviour does not depend
 * on Node.js implementation details.
 *
 * Register an interface with {@link trackReadline} once, right after it is
 * created, so the `'close'` listener is attached before the interface can
 * close. Calls made through the `safe*` helpers on an untracked-but-open
 * interface still work; tracking only adds the closed-state guard.
 *
 * @see https://nodejs.org/api/readline.html#event-close
 */
import type { Interface } from 'node:readline';

const closedInterfaces = new WeakSet< Interface >();

/**
 * Begin tracking a readline interface so its closed state can be detected.
 *
 * Attaches a one-time `'close'` listener that records the interface as closed.
 * Safe to call more than once for the same interface.
 *
 * @param rl The readline interface to track.
 * @returns The same interface, for convenient chaining.
 */
export function trackReadline( rl: Interface ): Interface {
	rl.once( 'close', () => {
		closedInterfaces.add( rl );
	} );
	return rl;
}

/**
 * Whether a tracked readline interface has already emitted `'close'`.
 *
 * @param rl The readline interface to inspect.
 * @returns `true` if the interface has been closed, otherwise `false`.
 */
export function isReadlineClosed( rl: Interface ): boolean {
	return closedInterfaces.has( rl );
}

/**
 * Resume the readline interface unless it has already been closed.
 *
 * @param rl The readline interface to resume.
 */
export function safeResume( rl: Interface ): void {
	if ( ! isReadlineClosed( rl ) ) {
		rl.resume();
	}
}

/**
 * Pause the readline interface unless it has already been closed.
 *
 * @param rl The readline interface to pause.
 */
export function safePause( rl: Interface ): void {
	if ( ! isReadlineClosed( rl ) ) {
		rl.pause();
	}
}

/**
 * Display the prompt unless the readline interface has already been closed.
 *
 * @param rl             The readline interface to prompt on.
 * @param preserveCursor When `true`, prevents the cursor from being reset to 0.
 */
export function safePrompt( rl: Interface, preserveCursor?: boolean ): void {
	if ( ! isReadlineClosed( rl ) ) {
		rl.prompt( preserveCursor );
	}
}

/**
 * Write data into the readline interface unless it has already been closed.
 *
 * @param rl   The readline interface to write to.
 * @param data The data to write.
 * @param key  An optional key sequence, mirroring `Interface#write`.
 */
export function safeWrite(
	rl: Interface,
	data: string | Buffer,
	key?: Parameters< Interface[ 'write' ] >[ 1 ]
): void {
	if ( ! isReadlineClosed( rl ) ) {
		rl.write( data, key );
	}
}
