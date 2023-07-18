export = Cache;
declare class Cache extends NodeCache {
    constructor({ log, cacheDir }?: {
        log?: Log;
        cacheDir?: string;
    });
    log: Log;
    cacheDir: string;
    /**
     * Sets an item in the cache
     *
     * @since 3.0.0
     * @alias lando.cache.set
     * @param {String} key The name of the key to store the data with.
     * @param {Any} data The data to store in the cache.
     * @param {Object} [opts] Options to pass into the cache
     * @param {Boolean} [opts.persist=false] Whether this cache data should persist between processes. Eg in a file instead of memory
     * @param {Integer} [opts.ttl=0] Seconds the cache should live. 0 mean forever.
     * @example
     * // Add a string to the cache
     * lando.cache.set('mykey', 'mystring');
     *
     * // Add an object to persist in the file cache
     * lando.cache.set('mykey', data, {persist: true});
     *
     * // Add an object to the cache for five seconds
     * lando.cache.set('mykey', data, {ttl: 5});
     */
    set(key: string, data: Any, { persist, ttl }?: {
        persist?: boolean;
        ttl?: Integer;
    }): void;
    /**
     * Gets an item in the cache
     *
     * @since 3.0.0
     * @alias lando.cache.get
     * @param {String} key The name of the key to retrieve the data.
     * @return {Any} The data stored in the cache if applicable.
     * @example
     * // Get the data stored with key mykey
     * const data = lando.cache.get('mykey');
     */
    get(key: string): Any;
    /**
     * Manually remove an item from the cache.
     *
     * @since 3.0.0
     * @alias lando.cache.remove
     * @param {String} key The name of the key to remove the data.
     * @example
     * // Remove the data stored with key mykey
     * lando.cache.remove('mykey');
     */
    remove(key: string): void;
    __get: <T>(key: string | number, cb?: NodeCache.Callback<T>) => T;
    __set: {
        <T_1>(key: string | number, value: T_1, ttl: string | number, cb?: NodeCache.Callback<boolean>): boolean;
        <T_2>(key: string | number, value: T_2, cb?: NodeCache.Callback<boolean>): boolean;
    };
    __del: (keys: (string | number) | (string | number)[], cb?: NodeCache.Callback<number>) => number;
}
import NodeCache = require("node-cache");
import Log = require("lando/lib/logger");
