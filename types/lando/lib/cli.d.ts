export = Cli;
declare class Cli {
    constructor(prefix?: string, logLevel?: string, userConfRoot?: string);
    prefix: string;
    logLevel: string;
    userConfRoot: string;
    /**
     * Returns a parsed array of CLI arguments and options
     *
     * @since 3.0.0
     * @alias lando.cli.argv
     * @return {Object} Yarg parsed options
     * @example
     * const argv = lando.cli.argv();
     * @todo make this static and then fix all call sites
     */
    argv(): any;
    /**
     * Checks to see if lando is running with sudo. If it is it
     * will exit the process with a stern warning
     *
     * @since 3.0.0
     * @alias lando.cli.checkPerms
     * @example
     * lando.cli.checkPerms()
     */
    checkPerms(): void;
    clearTaskCaches(): void;
    confirm(message?: string): {
        describe: string;
        alias: string[];
        default: boolean;
        boolean: boolean;
        interactive: {
            type: string;
            default: boolean;
            message: string;
        };
    };
    /**
     * Returns a config object with some good default settings for bootstrapping
     * lando as a command line interface
     *
     * @since 3.5.0
     * @alias lando.cli.defaultConfig
     * @param {Object} [appConfig={}] Optional raw landofile
     * @return {Object} Config that can be used in a Lando CLI bootstrap
     * @example
     * const config = lando.cli.defaultConfig();
     * // Kick off our bootstrap
     * bootstrap(config).then(lando => console.log(lando));
     */
    defaultConfig(appConfig?: any): any;
    formatData(data: any, { path, format, filter }?: {
        path?: string;
        format?: string;
        filter?: any[];
    }, opts?: {}): any;
    formatOptions(omit?: any[]): any;
    /**
     * Cli wrapper for error handler
     *
     * @since 3.0.0
     * @alias lando.cli.handleError
     * @param {Error} error The error
     * @param {Function} handler The error handler function
     * @param {Integer} verbose [verbose=this.argv().verbose] The verbosity level
     * @param {Object} lando The Lando object
     * @return {Integer} The exit codes
     */
    handleError(error: Error, handler: Function, verbose?: Integer, lando?: any): Integer;
    init(yargs: any, tasks: any, config: any, userConfig: any): void;
    /**
     * Returns some cli "art"
     *
     * @since 3.0.0
     * @alias lando.cli.makeArt
     * @param {String} [func='start'] The art func you want to call
     * @param {Object} [opts] Func options
     * @return {String} Usually a printable string
     * @example
     * console.log(lando.cli.makeArt('secretToggle', true);
     */
    makeArt(func?: string, opts?: any): string;
    /**
     * Parses a lando task object into something that can be used by the [yargs](http://yargs.js.org/docs/) CLI.
     *
     * A lando task object is an abstraction on top of yargs that also contains some
     * metadata about how to interactively ask questions on both a CLI and GUI.
     *
     * @since 3.5.0
     * @alias lando.cli.parseToYargs
     * @see [yargs docs](http://yargs.js.org/docs/)
     * @see [inquirer docs](https://github.com/sboudrias/Inquirer.js)
     * @param {Object} task A Lando task object (@see add for definition)
     * @param {Object} [config={}] The landofile
     * @return {Object} A yargs command object
     * @example
     * // Add a task to the yargs CLI
     * yargs.command(lando.tasks.parseToYargs(task));
     */
    parseToYargs({ command, describe, options, run, level }: any, config?: any): any;
    run(tasks?: any[], config?: {}): void;
    updateUserConfig(data?: {}): any;
}
