import debugLib from 'debug';
import { Select, Confirm } from 'enquirer';
import gql from 'graphql-tag';
import { setTimeout } from 'node:timers/promises';

import { UpdateJobQueryVariables } from './software.generated';
import { JobInterface, Query } from '../../graphqlTypes';
import API from '../api';
import { isAppNodejs, isAppWordPress } from '../app';
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
		app(id: $appId) {
			environments(id: $envId) {
				jobs(types: ["upgrade_php", "upgrade_wordpress", "upgrade_muplugins", "upgrade_nodejs"]) {
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
	}
`;

const COMPONENT_NAMES = {
	wordpress: 'WordPress',
	php: 'PHP',
	muplugins: 'MU Plugins',
	nodejs: 'Node.js',
};

type ComponentName = keyof typeof COMPONENT_NAMES;

const MANAGED_OPTION_KEY = 'managed_latest';

interface SoftwareSetting {
	options: Option[];
	current: {
		version: string;
	};
	pinned: boolean;
	name: string;
	slug: string;
}

type SoftwareSettings = Record< ComponentName, SoftwareSetting >;

interface Option {
	deprecated: boolean;
	unstable: boolean;
	version: string;
}

interface VersionChoice {
	message: string;
	value: string;
	disabled?: boolean;
	deprecated?: boolean;
}

interface VersionChoices {
	managed: VersionChoice[];
	supported: VersionChoice[];
	test: VersionChoice[];
	deprecated: VersionChoice[];
}

const _optionsForVersion = ( softwareSettings: SoftwareSetting ): VersionChoice[] => {
	const { options, current, pinned, slug } = softwareSettings;
	const versionChoices: VersionChoices = {
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
				deprecated: option.deprecated,
			} );
		} else if ( option.unstable ) {
			versionChoices.test.push( {
				message: `${ option.version } (test)`,
				value: option.version,
				deprecated: option.deprecated,
			} );
		} else {
			versionChoices.supported.push( {
				message: option.version,
				value: option.version,
				deprecated: option.deprecated,
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

const _processComponent = (
	appTypeId: number,
	userProvidedComponent?: ComponentName
): Promise< ComponentName > => {
	const validComponents: ComponentName[] = [];
	if ( isAppWordPress( appTypeId ) ) {
		validComponents.push( 'wordpress', 'php', 'muplugins' );
	} else if ( isAppNodejs( appTypeId ) ) {
		validComponents.push( 'nodejs' );
	}

	if ( userProvidedComponent ) {
		if ( ! validComponents.includes( userProvidedComponent ) ) {
			throw new UserError(
				`Component ${ userProvidedComponent } is not supported. Use one of: ${ validComponents.join(
					','
				) }`
			);
		}

		return Promise.resolve( userProvidedComponent );
	}

	if ( validComponents.length === 0 ) {
		throw new UserError( 'No components are supported for this application' );
	}

	if ( validComponents.length === 1 ) {
		return Promise.resolve( validComponents[ 0 ] );
	}

	const choices = validComponents.map( item => ( {
		message: COMPONENT_NAMES[ item ],
		value: item,
	} ) );

	const select = new Select( {
		message: 'Component to update',
		choices,
	} );
	return select.run().catch( () => {
		throw new UserError( 'Command cancelled by user.' );
	} ) as Promise< ComponentName >;
};

const _processComponentVersion = (
	softwareSettings: SoftwareSettings,
	component: ComponentName,
	userProvidedVersion?: string
): Promise< string > => {
	const versionChoices = _optionsForVersion( softwareSettings[ component ] );

	if ( userProvidedVersion ) {
		const validValues = versionChoices.map( item => item.value );
		if ( ! validValues.includes( userProvidedVersion ) ) {
			throw new UserError(
				`Version ${ userProvidedVersion } is not supported for ${
					COMPONENT_NAMES[ component ]
				}. Use one of: ${ validValues.join( ',' ) }`
			);
		}

		return Promise.resolve( userProvidedVersion );
	}

	const versionSelect = new Select( {
		message: `Version for ${ COMPONENT_NAMES[ component ] } to upgrade to`,
		choices: versionChoices,
	} );
	return versionSelect.run().catch( () => {
		throw new UserError( 'Command cancelled by user.' );
	} );
};

interface UpdateData {
	component: ComponentName;
	version: string;
}

export interface UpdatePromptOptions {
	component?: ComponentName;
	version?: string;
	force?: boolean;
}

export const promptForUpdate = async (
	appTypeId: number,
	opts: UpdatePromptOptions,
	softwareSettings: SoftwareSettings
): Promise< UpdateData > => {
	const component = await _processComponent( appTypeId, opts.component );
	const version = await _processComponentVersion( softwareSettings, component, opts.version );

	const confirm: boolean =
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		opts.force || // NOSONAR
		( await new Confirm( {
			message: `Are you sure you want to upgrade ${ COMPONENT_NAMES[ component ] } to ${ version }?`,
		} )
			.run()
			.catch( () => {
				throw new UserError( 'Command cancelled by user.' );
			} ) );

	if ( confirm ) {
		return {
			component,
			version,
		};
	}

	throw new UserError( 'Update canceled' );
};

interface TrigerUpdateOptions {
	appId: number;
	envId: number;
	component: string;
	version: string;
}

export const triggerUpdate = async ( variables: TrigerUpdateOptions ) => {
	debug( 'Triggering update', variables );
	const api = API();

	return api.mutate( { mutation: updateSoftwareMutation, variables } );
};

const _getLatestJob = async ( appId: number, envId: number ): Promise< JobInterface | null > => {
	const api = API();
	const result = await api.query< Query, UpdateJobQueryVariables >( {
		query: updateJobQuery,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );
	const jobs = result.data.app?.environments?.[ 0 ]?.jobs ?? [];

	if ( jobs.length ) {
		return jobs.reduce( ( prev, current ) =>
			( prev?.createdAt || '' ) > ( current?.createdAt || '' ) ? prev : current
		);
	}
	return null;
};

const _getCompletedJob = async ( appId: number, envId: number ): Promise< JobInterface | null > => {
	const latestJob = await _getLatestJob( appId, envId );
	debug( 'Latest job result:', latestJob );

	if ( ! latestJob?.inProgressLock ) {
		return latestJob;
	}

	debug( `Sleep for ${ UPDATE_PROGRESS_POLL_INTERVAL } seconds` );
	await setTimeout( UPDATE_PROGRESS_POLL_INTERVAL * 1000 );
	return _getCompletedJob( appId, envId );
};

interface UpdateResultSuccess {
	ok: true;
}

interface UpdateResultError {
	ok: false;
	errorMessage: string;
}

type UpdateResult = UpdateResultSuccess | UpdateResultError;

export const getUpdateResult = async ( appId: number, envId: number ): Promise< UpdateResult > => {
	debug( 'Getting update result', { appId, envId } );

	const completedJob = await _getCompletedJob( appId, envId );

	const success = ! completedJob || completedJob.progress?.status === 'success';
	if ( success ) {
		return {
			ok: true,
		};
	}

	const failedStep = completedJob.progress?.steps?.find( step => step?.status === 'failed' );
	const error = failedStep
		? `Failed during step: ${ failedStep.name as string }`
		: 'Software update failed';
	return {
		ok: false,
		errorMessage: error,
	};
};

interface FormatSoftwareSettingsResult {
	name: string;
	slug: string;
	version: string;
	available_versions?: string | string[];
}

export const formatSoftwareSettings = (
	softwareSetting: SoftwareSetting,
	includes: string[],
	format: string
): FormatSoftwareSettingsResult => {
	let version = softwareSetting.current.version;
	if ( softwareSetting.slug === 'wordpress' && ! softwareSetting.pinned ) {
		version += ' (managed updates)';
	}
	const result: FormatSoftwareSettingsResult = {
		name: softwareSetting.name,
		slug: softwareSetting.slug,
		version,
	};

	if ( includes.includes( 'available_versions' ) ) {
		result.available_versions = _optionsForVersion( softwareSetting )
			.filter( option => ! option.deprecated )
			.map( option => option.value );

		if ( format !== 'json' ) {
			result.available_versions = result.available_versions.sort().join( ',' );
		}
	}

	return result;
};
