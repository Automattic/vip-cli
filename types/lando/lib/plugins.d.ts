export = Plugins;
declare class Plugins {
    constructor(log?: Log);
    registry: any[];
    log: Log;
    /**
     * Finds plugins
     *
     * @since 3.5.0
     * @alias lando.plugins.find
     * @param {Array} dirs Directories to scan for plugins
     * @param {Object} options Options to pass in
     * @param {Array} [options.disablePlugins=[]] Array of plugin names to not load
     * @param {Array} [options.plugins=[]] Array of additional plugins to consider loading
     * @return {Array} Array of plugin metadata
     */
    find(dirs: any[], { disablePlugins, plugins }?: {
        disablePlugins?: any[];
        plugins?: any[];
    }): any[];
    /**
     * Loads a plugin.
     *
     * @since 3.0.0
     * @alias lando.plugins.load
     * @param {String} plugin The name of the plugin
     * @param {String} [file=plugin.path] That path to the plugin
     * @param {Object} [...injected] Something to inject into the plugin
     * @return {Object} Data about our plugin.
     */
    load(plugin: string, file?: string, ...injected: any[]): any;
}
import Log = require("lando/lib/logger");
