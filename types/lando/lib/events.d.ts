export = AsyncEvents;
declare class AsyncEvents extends EventEmitter {
    constructor(log?: Log);
    log: Log;
    _listeners: any[];
    /**
     * Our overridden event on method.
     *
     * This optionally allows a priority to be specified. Lower priorities run first.
     *
     * @since 3.0.0
     * @alias lando.events.on
     * @param {String} name The name of the event
     * @param {Integer} [priority=5] The priority the event should run in.
     * @param {Function} fn The function to call. Should get the args specified in the corresponding `emit` declaration.
     * @return {Promise} A Promise
     * @example
     * // Print out all our apps as they get instantiated and do it before other `post-instantiate-app` events
     * lando.events.on('post-instantiate-app', 1, app => {
     *   console.log(app);
     * });
     *
     * // Log a helpful message after an app is started, don't worry about whether it runs before or
     * // after other `post-start` events
     * return app.events.on('post-start', () => {
     *   lando.log.info('App %s started', app.name);
     * });
     */
    on(name: string, priority: number, fn: (...args: any[]) => unknown | Promise<unknown>): this;
    on(name: string, fn: (...args: any[]) => unknown | Promise<unknown>): this;
    once(eventName: string | symbol, listener: (...args: any[]) => unknown | Promise<unknown>): this;
    /**
     * Reimplements event emit method.
     *
     * This makes events blocking and promisified.
     *
     * @since 3.0.0
     * @alias lando.events.emit
     * @param {String} name The name of the event
     * @param {...Any} [args] Options args to pass.
     * @return {Promise} A Promise
     * @example
     * // Emits a global event with a config arg
     * return lando.events.emit('wolf359', config);
     *
     * // Emits an app event with a config arg
     * return app.events.emit('sector001', config);
     */
    emit(...args?: any[]): Promise<unknown>;
    __on: (eventName: string | symbol, listener: (...args: any[]) => void) => EventEmitter;
    __emit: (eventName: string | symbol, ...args: any[]) => boolean;
}
import EventEmitter_1 = require("events");
import EventEmitter = EventEmitter_1.EventEmitter;
import Log = require("lando/lib/logger");
