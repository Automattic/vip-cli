export = ErrorHandler;
declare class ErrorHandler {
    constructor(log?: Log, metrics?: Metrics);
    log: Log;
    metrics: Metrics;
    /**
     * Returns the lando options
     *
     * This means all the options passed in before the `--` flag.
     *
     * @since 3.0.0
     * @alias lando.error.handle
     * @param {Object} error Error object
     * @param {Boolean} report Whether to report the error or not
     * @return {Integer} the error code
     * @example
     * // Gets all the pre-global options that have been specified.
     * const argv = lando.tasks.argv();
     * @todo make this static and then fix all call sites
     */
    handle({ message, stack, code, hide, verbose }?: any, report?: boolean): Integer;
}
import Log = require("lando/lib/logger");
import Metrics = require("lando/lib/metrics");
