/**
 * External dependencies
 */
import { Select, Confirm } from 'enquirer';
import gql from 'graphql-tag';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { isAppNodejs, isAppWordPress } from '../app';
import API from '../api';
import UserError from '../user-error';

const UPDATE_PROGRESS_POLL_INTERVAL = 5;
const debug = debugLib( '@automattic/vip:bin:config-software' );

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
		uniqueLabel
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

const updateSoftwareMutation = gql`
	mutation UpdateSoftwareSettings(
		$appId: Int!
		$envId: Int!
		$component: String!
		$version: String!
	) {
		updateSoftwareSettings(
			input: {
				appId: $appId
				environmentId: $envId
				softwareName: $component
				softwareVersion: $version
			}
		) {
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
	}
	${ appQueryFragments }
`;

const updateJobQuery = gql`
	query UpdateJob($appId: Int!, $envId: Int!) {
		app(id: $appId ) {
			environments(id: $envId) {
				jobs (types:["upgrade_php", "upgrade_wordpress", "upgrade_muplugins", "upgrade_nodejs"]) {
					type
					completedAt
					createdAt
					inProgressLock
					progress {
						status
						steps {
							step
							name
							status
						}
					}
				}
			}
		}
	}`;

const COMPONENT_NAMES = {
	wordpress: 'WordPress',
	php: 'PHP',
	muplugins: 'MU Plugins',
	nodejs: 'Node.js',
};

const MANAGED_OPTION_KEY = 'managed_latest';

const _optionsForVersion = ( softwareSettings ) => {
	const { options, current, pinned, slug } = softwareSettings;
	const versionChoices = {
		managed: [],
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

	if ( slug === 'wordpress' ) {
		versionChoices.managed.push( {
			message: 'Managed updates',
			value: MANAGED_OPTION_KEY,
		} );
	}

	const allOptions = [
		...versionChoices.managed,
		...versionChoices.supported,
		...versionChoices.test,
		...versionChoices.deprecated,
	];

	return allOptions.map( option => {
		const isActivePinned = option.value === MANAGED_OPTION_KEY && ! pinned;
		const isActiveVersion = option.value === current.version && pinned;
		if ( isActivePinned || isActiveVersion ) {
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
			throw new UserError( `Component ${ userProvidedComponent } is not supported. Use one of: ${ validComponents.join( ',' ) }` );
		}
		return userProvidedComponent;
	}

	if ( validComponents.length === 0 ) {
		throw new UserError( 'No components are supported for this application' );
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
	const versionChoices = _optionsForVersion( softwareSettings[ component ] );

	if ( userProvidedVersion ) {
		const validValues = versionChoices.map( item => item.value );
		if ( ! validValues.includes( userProvidedVersion ) ) {
			throw new UserError( `Version ${ userProvidedVersion } is not supported for ${ COMPONENT_NAMES[ component ] }. Use one of: ${ validValues.join( ',' ) }` );
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

	throw new UserError( 'Update canceled' );
};

interface TrigerUpdateOptions {
	appId: number,
	envId: number,
	component: string,
	version: string,
}

export const triggerUpdate = async ( variables: TrigerUpdateOptions ) => {
	debug( 'Triggering update', variables );
	const api = await API();

	return await api.mutate( { mutation: updateSoftwareMutation, variables } );
};

const _getLatestJob = async ( appId: number, envId: number ) => {
	const api = await API();
	let latestJob = null;
	const result = await api.query( { query: updateJobQuery, variables: { appId, envId }, fetchPolicy: 'network-only' } );
	const jobs = result?.data?.app?.environments[ 0 ].jobs || [];
	for ( const job of jobs ) {
		if ( latestJob ) {
			if ( job.createdAt > latestJob.createdAt ) {
				latestJob = job;
			}
		} else {
			latestJob = job;
		}
	}
	return latestJob;
};

const _getCompletedJob = async ( appId: number, envId: number ) => {
	const latestJob = await _getLatestJob( appId, envId );
	debug( 'Latest job result:', latestJob );

	if ( ! latestJob || ! latestJob.inProgressLock ) {
		return latestJob;
	}

	debug( `Sleep for ${ UPDATE_PROGRESS_POLL_INTERVAL } seconds` );
	await new Promise( resolve => setTimeout( resolve, UPDATE_PROGRESS_POLL_INTERVAL * 1000 ) );

	return _getCompletedJob( appId, envId );
};

interface UpdateResult {
	ok: boolean,
	errorMessage: string,
}

export const getUpdateResult = async ( appId: number, envId: number ): UpdateResult => {
	debug( 'Getting update result', { appId, envId } );

	const completedJob = await _getCompletedJob( appId, envId );

	const success = ! completedJob || completedJob?.progress?.status === 'success';
	if ( success ) {
		return {
			ok: true,
		};
	}

	const failedStep = completedJob?.progress?.steps?.find( step => step.status === 'failed' );
	const error = failedStep ? `Failed during step: ${ failedStep.name }` : 'Software update failed';
	return {
		ok: false,
		errorMessage: error,
	};
};
