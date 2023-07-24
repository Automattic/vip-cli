export = Yaml;
declare class Yaml {
    constructor(log?: Log);
    log: Log;
    /**
     * Loads a yaml object from a file.
     *
     * @since 3.0.0
     * @alias lando.yaml.load
     * @param {String} file The path to the file to be loaded
     * @return {Object} The loaded object
     * @example
     * // Add a string to the cache
     * const thing = lando.yaml.load('/tmp/myfile.yml');
     */
    load(file: string): any;
    /**
     * Dumps an object to a YAML file
     *
     * @since 3.0.0
     * @alias lando.yaml.dump
     * @param {String} file The path to the file to be loaded
     * @param {Object} data The object to dump
     * @return {String} Flename
     */
    dump(file: string, data?: any): string;
}
import Log = require("lando/lib/logger");
