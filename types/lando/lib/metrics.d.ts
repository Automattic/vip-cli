export = Metrics;
declare class Metrics {
    constructor({ id, log, endpoints, data }?: {
        id?: string;
        log?: Log;
        endpoints?: any[];
        data?: {};
    });
    id: string;
    log: Log;
    endpoints: any[];
    data: {};
    report(action?: string, data?: {}): any;
}
import Log = require("lando/lib/logger");
