/**
 * External dependencies
 */
import { Select, Confirm } from 'enquirer';
import { isAppNodejs, isAppWordPress } from '../utils/app';

/**
 * Internal dependencies
 */


export const appQuery = `
	id,
	name,
	type,
	typeId,
	organization { id, name },
	environments{
		appId
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

export const appQueryFragments = `fragment Software on AppEnvironmentSoftwareSettingsSoftware {
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

const COMPONENT_NAMES = {
	wordpress: 'WordPress',
	php: 'PHP',
	muplugins: 'MU Plugins',
	nodejs: 'Node.js',
};

const _optionsForVersion = ( options, current ) => {
	const versionChoices = {
		supported: [],
		test: [],
		deprecated: [],
	};
	for ( const option of options ) {
		if ( option.deprecated ) {
			versionChoices.deprecated.push( {
				message: `${ option.version } (deprecated)`,
				value: option.version,
			} );
		} else if ( option.unstable ) {
			versionChoices.test.push( {
				message: `${ option.version } (test)`,
				value: option.version,
			} );
		} else {
			versionChoices.supported.push( {
				message: option.version,
				value: option.version,
			} );
		}
	}

	const allOptions = [ ...versionChoices.supported, ...versionChoices.test, ...versionChoices.deprecated ];

	return allOptions.map( option => {
		if ( option.value === current ) {
			return {
				message: `Active: ${ option.message }`,
				value: option.value,
				disabled: true,
			};
		}
		return option;
	} );
};

const _processComponent = async ( appTypeId: number, userProvidedComponent: string | undefined ) => {
	const validComponents = [];
	if ( isAppWordPress( appTypeId ) ) {
		validComponents.push( 'wordpress', 'php', 'muplugins' );
	} else if ( isAppNodejs( appTypeId ) ) {
		validComponents.push( 'nodejs' );
	}

	if ( userProvidedComponent ) {
		if ( ! validComponents.includes( userProvidedComponent ) ) {
			// TODO throw user error
			throw Error( `Component ${ userProvidedComponent } is not supported. Use one of: ${ validComponents.join( ',' ) }` );
		}
		return userProvidedComponent;
	}

	if ( validComponents.length === 0 ) {
		// TODO throw user error
		throw Error( 'No components are supported for this application' );
	}

	if ( validComponents.length === 1 ) {
		return validComponents[ 0 ];
	}

	const choices = validComponents.map( item => ( {
		message: COMPONENT_NAMES[ item ],
		value: item,
	} ) );
	const select = new Select( {
		message: 'Component to update',
		choices,
	} );
	return await select.run();
};

const _processComponentVersion = async ( softwareSettings, component: string, userProvidedVersion: string | undefined ) => {
	const versionChoices = _optionsForVersion( softwareSettings[ component ].options, softwareSettings[ component ].current.version );

	if ( userProvidedVersion ) {
		const validValues = versionChoices.map( item => item.value );
		if ( ! validValues.includes( userProvidedVersion ) ) {
			// TODO throw user error
			throw Error( `Version ${ userProvidedVersion } is not supported for ${ COMPONENT_NAMES[ component ] }. Use one of: ${ validValues.join( ',' ) }` );
		}
		return userProvidedVersion;
	}

	const versionSelect = new Select( {
		message: `Version for ${ COMPONENT_NAMES[ component ] } to upgrade to`,
		choices: versionChoices,
	} );
	return await versionSelect.run();
};

interface UpdateData {
	component: string,
	version: string,
}


export interface UpdatePromptOptions {
	component?: string,
	version?: string,
	force?: boolean,
}

export const promptForUpdate = async ( appTypeId: number, opts: UpdatePromptOptions, softwareSettings ): UpdateData => {
	const component = await _processComponent( appTypeId, opts.component );
	const version = await _processComponentVersion( softwareSettings, component, opts.version );

	const confirm = opts.force || await new Confirm( {
		message: `Are you sure you want to upgrade ${ COMPONENT_NAMES[ component ] } to ${ version }?`,
	} ).run();

	if ( confirm ) {
		return {
			component,
			version,
		};
	}

	// TODO throw user error
	process.exit( 0 );
};
