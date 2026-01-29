import winston = require('winston');
export = Log;
declare class Log extends winston.Logger {
	constructor( {
		logDir,
		logFile,
		logLevelConsole,
		logLevel,
		logName,
		logger,
	}?: {
		logDir: any;
		logFile?: string;
		logLevelConsole?: string;
		logLevel?: string;
		logName?: string;
		logger?: winston.Logger;
	} );
	sanitizedKeys: string[];
	alsoSanitize( key: any ): void;
	child( logName: string ): Log;
}
