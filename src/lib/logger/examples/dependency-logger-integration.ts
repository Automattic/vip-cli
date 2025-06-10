/**
 * This is an example of how to integrate a dependency with our Winston-based logger.
 * It demonstrates the approach for both dependencies that accept Winston loggers
 * and those that use the debug library.
 */

import debugLib, { createLoggerForDependency } from '../../logger';
import { attachLoggerToDependency } from '../../utils';

// Import a hypothetical third-party dependency
// In a real scenario, replace this with the actual dependency
// import SomeDependency from 'some-dependency';

const debug = debugLib( '@automattic/vip:example:dependency-integration' );

/**
 * Example 1: Dependency that accepts a Winston logger
 *
 * This is for dependencies that expect a Winston logger instance
 */
export function exampleWithWinstonDependency() {
	debug( 'Setting up a dependency with Winston logger integration' );

	// Mock dependency for demonstration
	const mockDependency = {
		performAction: () => {
			console.log( 'Dependency action performed' );
			return true;
		},
	};

	// Attach a Winston logger to the dependency
	// The namespace will be used to identify logs from this dependency
	const dependencyWithLogger = attachLoggerToDependency(
		'@automattic/vip:dependencies:mock-dependency',
		mockDependency
	);

	// The dependency now has a Winston logger attached
	// and its logs will be captured by our central logging system
	return dependencyWithLogger;
}

/**
 * Example 2: Setting environment variables for dependencies using debug
 *
 * Some dependencies might use the debug library internally and can't be
 * directly modified to use our logger. For these, we can capture their
 * debug output by setting the DEBUG environment variable.
 */
export function setupDebugForExternalDependencies() {
	// Set DEBUG environment variable to capture specific namespaces
	// This will cause the debug library to output to stdout, which we can
	// capture in our winston console transport

	const currentDebugEnv = process.env.DEBUG || '';
	const dependencyDebugNamespaces = 'dependency-name:*,other-dependency:*';

	// Append to existing DEBUG env var if it exists
	if ( currentDebugEnv ) {
		process.env.DEBUG = `${ currentDebugEnv },${ dependencyDebugNamespaces }`;
	} else {
		process.env.DEBUG = dependencyDebugNamespaces;
	}

	debug( `DEBUG environment variable set to: ${ process.env.DEBUG }` );
}

/**
 * Example 3: Creating a custom adapter for a dependency
 *
 * For dependencies with unique logging interfaces, we can create
 * custom adapters that forward logs to our Winston logger.
 */
export function createCustomLoggerAdapter() {
	// Get a Winston logger for this dependency
	const dependencyLogger = createLoggerForDependency( '@automattic/vip:dependencies:custom' );

	// Create a custom adapter that matches the dependency's expected interface
	const customAdapter = {
		log: ( message: string ) => dependencyLogger.info( message ),
		error: ( message: string ) => dependencyLogger.error( message ),
		warn: ( message: string ) => dependencyLogger.warn( message ),
		debug: ( message: string ) => dependencyLogger.debug( message ),
		// Add any other methods the dependency expects
	};

	return customAdapter;
}

/**
 * In an actual implementation, you would use one of these approaches
 * based on the specific dependency you're integrating with.
 */
