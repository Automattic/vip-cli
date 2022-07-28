#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{
		id
		name
		type
		softwareSettings {
			php {
			  ...Software
			}
			wordpress {
			  ...Software
			}
			muplugins {
			  ...Software
			}
			nodejs {
			  ...Software
			}
		}
	}`;
const appQueryFragments = `fragment Software on AppEnvironmentSoftwareSettingsSoftware {
		name
		slug
		pinned
		current {
		  version
		  default
		  deprecated
		  unstable
		  compatible
		  latestRelease
		  private
		}
		options {
		  version
		  default
		  deprecated
		  unstable
		  compatible
		  latestRelease
		  private
		}
	}
`;

command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	// requiredArgs: 0,
} ).argv( process.argv, async ( arg: string[], { app, env } ) => {
	const { id: envId, appId } = env;
	console.log('e', env);
} );
