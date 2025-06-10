import winston from 'winston';
import path from 'path';
import fs from 'fs';
import util from 'util';
import os from 'os';

interface VIPLoggerOptions {
  logDir?: string;
  consoleLevel?: string;
  fileLevel?: string;
  filename?: string;
}

interface DebugLikeLogger {
  (...args: any[]): boolean;
  enabled: boolean;
  namespace: string;
  error: (...args: any[]) => boolean;
  warn: (...args: any[]) => boolean;
  info: (...args: any[]) => boolean;
  verbose: (...args: any[]) => boolean;
  debug: (...args: any[]) => boolean;
  silly: (...args: any[]) => boolean;
}

class VIPLogger {
  private logDir: string;
  private rootLogger: winston.Logger;
  private loggers: Map<string, DebugLikeLogger>;
  private enabledNamespaces: Set<string>;
  private isDebugMode: boolean;

  constructor(options: VIPLoggerOptions = {}) {
    this.logDir = options.logDir || path.join(os.homedir(), '.vip-cli', 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });
    
    // Check if --debug flag is passed
    this.isDebugMode = process.argv.includes('--debug') || process.argv.includes('-d');
    
    // Container for namespace-specific loggers
    this.loggers = new Map();

    // Parse DEBUG env var like the debug library does
    this.enabledNamespaces = new Set(['*']); // Enable all by default
    if (process.env.DEBUG) {
      this.enabledNamespaces = this._parseDebugEnv(process.env.DEBUG);
    }
    
    // Create the root logger with shared transports
    this.rootLogger = this._createRootLogger(options);
  }

  private _parseDebugEnv(debugEnv: string): Set<string> {
    const namespaces = new Set<string>();
    const patterns = debugEnv.split(/[\s,]+/);
    
    for (const pattern of patterns) {
      if (!pattern) continue;
      
      // Handle negated patterns
      const isExclude = pattern.charAt(0) === '-';
      const ns = isExclude ? pattern.slice(1) : pattern;
      
      if (isExclude) {
        namespaces.delete(ns);
      } else {
        namespaces.add(ns);
      }
    }
    
    return namespaces;
  }
  
  private _createRootLogger(options: VIPLoggerOptions): winston.Logger {
    // Determine console log level based on debug mode
    const consoleLevel = options.consoleLevel || (this.isDebugMode ? 'debug' : 'warn');
    const fileLevel = options.fileLevel || 'debug'; // Always log everything to file
    const filename = options.filename || 'vip-cli.log';

    return winston.createLogger({
      level: 'debug', // Set internal level to debug to capture everything
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          level: consoleLevel,
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, namespace = 'app' }) => 
              `${timestamp} ${namespace} ${level}: ${message}`)
          )
        }),
        new winston.transports.File({
          level: fileLevel,
          filename: path.join(this.logDir, filename),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, namespace = 'app' }) => 
              `${timestamp} ${namespace} ${level}: ${message}`)
          )
        })
      ]
    });
  }

  // Check if a namespace is enabled (compatible with debug.enabled())
  public isEnabled(namespace: string): boolean {
    // If '*' is enabled, everything is enabled
    if (this.enabledNamespaces.has('*')) {
      return true;
    }

    // Check for exact match
    if (this.enabledNamespaces.has(namespace)) {
      return true;
    }

    // Check for wildcard matches
    for (const enabledNs of this.enabledNamespaces) {
      if (enabledNs.endsWith('*') && namespace.startsWith(enabledNs.slice(0, -1))) {
        return true;
      }
    }

    return false;
  }
  
  // Get or create a logger for a namespace
  public getLogger(namespace: string): DebugLikeLogger {
    if (!this.loggers.has(namespace)) {
      // Create a child logger with namespace metadata
      const childLogger = this.rootLogger.child({ namespace });
      
      // Create a debug-compatible function
      const debugFn = (...args: any[]) => {
        const message = util.format(...args);
        childLogger.debug(message);
        return true;
      };
      
      // Add additional winston methods
      const levels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'] as const;
      levels.forEach(level => {
        (debugFn as any)[level] = (...args: any[]) => {
          const message = util.format(...args);
          childLogger[level](message);
          return true;
        };
      });
      
      // Add debug-compatible properties
      debugFn.enabled = true;
      debugFn.namespace = namespace;

      // Add debug-compatible static method
      (debugFn as any).enabled = (checkNamespace: string) => {
        return this.isEnabled(checkNamespace);
      };
      
      // Add type casts to satisfy TypeScript
      const typedDebugFn = debugFn as unknown as DebugLikeLogger;
      
      // Store in the map
      this.loggers.set(namespace, typedDebugFn);
    }
    
    return this.loggers.get(namespace)!;
  }
  
  // Get the Winston root logger to pass to dependencies
  public getRootLogger(): winston.Logger {
    return this.rootLogger;
  }
  
  // Create a logger instance that can be passed to dependencies
  public createLoggerForDependency(namespace: string): winston.Logger {
    // Create a new Winston logger that will forward to our root logger
    const dependencyLogger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { namespace }
    });
    
    // Add a transport that forwards to our root logger
    dependencyLogger.add(new winston.transports.Stream({
      stream: {
        write: (message: string) => {
          try {
            const logObj = JSON.parse(message);
            // Add namespace if not provided
            if (!logObj.namespace) {
              logObj.namespace = namespace;
            }
            // Forward to our root logger at the appropriate level
            const level = logObj.level || 'debug';
            this.rootLogger.log({ 
              level, 
              message: logObj.message,
              namespace: logObj.namespace,
              ...logObj
            });
          } catch (e) {
            // Fallback if parsing fails
            this.rootLogger.debug(`${namespace}: ${message}`);
          }
        }
      }
    }));
    
    return dependencyLogger;
  }
  
  // Check if we're in debug mode
  public isInDebugMode(): boolean {
    return this.isDebugMode;
  }
}

// Create singleton instance
const vipLogger = new VIPLogger();

// Export a debug-compatible function as the default export
const debugLib = function(namespace: string): DebugLikeLogger {
  return vipLogger.getLogger(namespace);
};

// Add debug.enabled method to match the debug library's API
debugLib.enabled = (namespace: string): boolean => {
  return vipLogger.isEnabled(namespace);
};

// Also export the logger instance and utility methods
export const logger = vipLogger;
export const getRootLogger = (): winston.Logger => vipLogger.getRootLogger();
export const createLoggerForDependency = (namespace: string): winston.Logger => 
  vipLogger.createLoggerForDependency(namespace);
export const isDebugMode = (): boolean => vipLogger.isInDebugMode();

export default debugLib; 