export = Shell;
declare class Shell {
    constructor(log?: Log);
    log: Log;
    running: any[];
    stdout: any;
    stderr: any;
    /**
     * Gets running processes.
     *
     * @since 3.0.0
     * @alias lando.shell.get
     * @return {Array} An array of the currently running processes
     */
    get(): any[];
    /**
     * Runs a command.
     *
     * This is an abstraction method that:
     *
     *  1. Delegates to either node's native `spawn` or `exec` methods.
     *  2. Promisifies the calling of these function
     *  3. Handles `stdout`, `stdin` and `stderr`
     *
     * @since 3.0.0
     * @alias lando.shell.sh
     * @see [extra exec options](https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback)
     * @see [extra spawn options](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
     * @param {Array} cmd The command to run as elements in an array.
     * @param {Object} [opts] Options to help determine how the exec is run.
     * @param {Boolean} [opts.mode='exec'] The mode to run in
     * @param {Boolean} [opts.detached=false] Whether we are running in detached mode or not (deprecated)
     * @param {Boolean} [opts.cwd=process.cwd()] The directory to run the command from
     * @return {Promise} A promise with collected results if applicable.
     * @example
     * // Run a command in collect mode
     * return lando.shell.sh(['ls', '-lsa', '/'], {mode: 'collect'})
     *
     * // Catch and log any errors
     * .catch(err => {
     *   lando.log.error(err);
     * })
     *
     * // Print the collected results of the command
     * .then(results => {
     *   console.log(results);
     * });
     */
    sh(cmd: any[], { mode, detached, cwd, cstdio, silent }?: {
        mode?: boolean;
        detached?: boolean;
        cwd?: boolean;
    }): Promise;
    /**
     * Returns the path of a specific command or binary.
     *
     * @since 3.0.0
     * @function
     * @alias lando.shell.which
     * @param {String} cmd A command to search for.
     * @return {String|null} The path to the command or null.
     * @example
     * // Determine the location of the 'docker' command
     * const which = lando.shell.which(DOCKER_EXECUTABLE);
     */
    which(cmd: string): string | null;
}
import Log = require("lando/lib/logger");
