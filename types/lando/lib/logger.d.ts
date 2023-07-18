import winston = require("winston");
export = Log;
declare class Log extends winston.Logger {
    constructor({ logDir, logLevelConsole, logLevel, logName }?: {
        logDir: any;
        logLevelConsole?: string;
        logLevel?: string;
        logName?: string;
    });
    sanitizedKeys: string[];
    alsoSanitize(key: any): void;
}
