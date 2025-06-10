# VIP CLI Logger

This is a Winston-based logging system for the VIP CLI that maintains compatibility with the debug library's API while providing enhanced functionality.

## Features

- Drop-in replacement for the debug library
- File logging to capture all CLI output
- Structured logging with namespaces
- Multiple log levels (error, warn, info, verbose, debug, silly)
- Integration with third-party dependencies
- Centralized log configuration

## Basic Usage

The logger is designed to be a direct replacement for the debug library. You can use it the same way:

```typescript
// Import the logger
import debugLib from '../lib/logger';

// Create a namespaced logger
const debug = debugLib('your:namespace');

// Use it like debug
debug('Some message');
debug('Object: %o', { foo: 'bar' });
```

## Advanced Usage

### Using Different Log Levels

Unlike debug, our logger provides standard Winston log levels:

```typescript
import debugLib from '../lib/logger';
const debug = debugLib('your:namespace');

// Different log levels
debug.error('Critical error');
debug.warn('Warning message');
debug.info('Informational message');
debug.verbose('Verbose message');
debug.debug('Debug message'); // Same as calling debug() directly
debug.silly('Very detailed message');
```

### Integrating with Dependencies

The logger system provides methods to integrate with third-party dependencies:

```typescript
import { createLoggerForDependency } from '../lib/logger';
import { attachLoggerToDependency } from '../lib/utils';

// For dependencies that accept a Winston logger
const dependencyLogger = createLoggerForDependency('dependency:namespace');
myDependency.setLogger(dependencyLogger);

// Or use the utility function
const enhancedDependency = attachLoggerToDependency(
  'dependency:namespace',
  myDependency,
  'loggerPropName' // Optional, defaults to 'logger'
);
```

### Handling Dependencies That Use Debug

For dependencies that use the debug library internally, you can configure them to output to your logger by setting the DEBUG environment variable:

```typescript
// Configure debug namespaces to show output
const currentDebugEnv = process.env.DEBUG || '';
const dependencyDebugNamespaces = 'dependency-name:*,other-dependency:*';

// Append to existing DEBUG env var
if (currentDebugEnv) {
  process.env.DEBUG = `${currentDebugEnv},${dependencyDebugNamespaces}`;
} else {
  process.env.DEBUG = dependencyDebugNamespaces;
}
```

## Implementation Details

The logger is implemented as a singleton that maintains a consistent logging interface across the application. All log messages are:

1. Displayed in the console with appropriate formatting and colors
2. Written to a log file in the user's home directory (~/.vip-cli/logs/vip-cli.log)
3. Structured with timestamps and namespace information

## Log File Location

Log files are stored in:

```
~/.vip-cli/logs/vip-cli.log
```

This path can be configured by modifying the options in the logger implementation. 