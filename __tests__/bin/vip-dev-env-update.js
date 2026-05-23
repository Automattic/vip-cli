jest.mock( '../../src/lib/cli/command', () => {
	const command = jest.fn( () => commandMock );
	command.registeredHandler = undefined;

	const commandMock = {
		option: () => commandMock,
		examples: () => commandMock,
		argv: ( _argv, handler ) => {
			command.registeredHandler = handler;
			return commandMock;
		},
	};

	return command;
} );

jest.mock( '../../src/lib/dev-environment/dev-environment-cli', () => ( {
	addDevEnvConfigurationOptions: jest.fn(),
	getEnvTrackingInfo: jest.fn( () => ( { slug: 'example-site' } ) ),
	getEnvironmentName: jest.fn( async () => 'example-site' ),
	handleCLIException: jest.fn(),
	processSlug: jest.fn( value => value ),
	promptForArguments: jest.fn( async () => ( { wpTitle: 'Site Title' } ) ),
	validateDependencies: jest.fn(),
	ensureValidPathsInOptions: jest.fn(),
	getDevEnvLogFile: jest.fn( () => '/tmp/dev-env.log' ),
} ) );

jest.mock( '../../src/lib/dev-environment/dev-environment-configuration-file', () => ( {
	getConfigurationFileOptions: jest.fn( async () => ( {
		overrides: 'services:\n  appserver:\n    environment:\n      FOO: bar',
	} ) ),
	mergeConfigurationFileOptions: jest.fn( ( cliOptions, configOptions ) => ( {
		...configOptions,
		...cliOptions,
	} ) ),
} ) );

jest.mock( '../../src/lib/dev-environment/dev-environment-core', () => ( {
	doesEnvironmentExist: jest.fn( async () => true ),
	getEnvironmentPath: jest.fn( () => '/tmp/example-site' ),
	readEnvironmentData: jest.fn( () => ( {
		wpTitle: 'Current Title',
		multisite: false,
		appCode: { tag: 'demo' },
		muPlugins: { tag: 'demo' },
		wordpress: { tag: 'trunk' },
		elasticsearch: false,
		php: '8.2',
		mariadb: '10.6',
		phpmyadmin: false,
		xdebug: false,
		mailpit: false,
		photon: false,
		mediaRedirectDomain: '',
		cron: false,
		adminPassword: '',
	} ) ),
	updateEnvironment: jest.fn( async () => {} ),
} ) );

jest.mock( '../../src/lib/dev-environment/dev-environment-lando', () => ( {
	bootstrapLando: jest.fn( async () => ( {} ) ),
} ) );

jest.mock( '../../src/lib/tracker', () => ( {
	trackEvent: jest.fn( async () => {} ),
} ) );

import command from '../../src/lib/cli/command';
import { promptForArguments } from '../../src/lib/dev-environment/dev-environment-cli';

import '../../src/bin/vip-dev-env-update';

function setStdinTTY( value ) {
	Object.defineProperty( process.stdin, 'isTTY', {
		configurable: true,
		value,
	} );
}

describe( 'vip dev-env update prompt suppression', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		process.exitCode = 0;
	} );

	afterEach( () => {
		setStdinTTY( true );
	} );

	it( 'keeps wizard interactive for TTY even with metadata/config options present', async () => {
		setStdinTTY( true );

		await command.registeredHandler( [], {
			slug: 'example-site',
			metadata: { source: 'test' },
		} );

		expect( promptForArguments ).toHaveBeenCalledWith(
			expect.any( Object ),
			expect.any( Object ),
			false,
			false
		);
	} );

	it( 'uses partial options as preselected values while keeping wizard interactive in TTY', async () => {
		setStdinTTY( true );

		await command.registeredHandler( [], {
			slug: 'example-site',
			php: '8.3',
		} );

		expect( promptForArguments ).toHaveBeenCalledWith(
			expect.objectContaining( { php: '8.3' } ),
			expect.any( Object ),
			false,
			false
		);
	} );

	it( 'suppresses wizard prompts in non-TTY mode', async () => {
		setStdinTTY( false );

		await command.registeredHandler( [], {
			slug: 'example-site',
		} );

		expect( promptForArguments ).toHaveBeenCalledWith(
			expect.any( Object ),
			expect.any( Object ),
			true,
			false
		);
	} );
} );
