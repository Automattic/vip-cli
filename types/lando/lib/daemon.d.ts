export = LandoDaemon;
declare class LandoDaemon {
    constructor(cache?: Cache, events?: Events, docker?: string | boolean, log?: Log, context?: string, compose?: string | boolean);
    cache: Cache;
    compose: string | boolean;
    context: string;
    docker: string | boolean;
    events: Events;
    log: Log;
    up(): any;
    down(): any;
    isUp(log?: Log, cache?: Cache, docker?: string | boolean): any;
    getVersions(): any;
    getComposeSeparator(): any;
}
import Cache = require("lando/lib/cache");
import Events = require("lando/lib/events");
import Log = require("lando/lib/logger");
