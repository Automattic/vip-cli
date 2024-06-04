const { exec } = require( 'node:child_process' );
const { EOL } = require( 'node:os' );
const { minVersion, satisfies, valid } = require( 'semver' );

const packageJSON = require( '../package.json' );

const config = {
	gitAllowDirty: true,
	gitEnforceBranch: 'trunk',
	nodeEnforceVersion: packageJSON.engines.node,
	testBeforePublish: process.env.CI !== 'true',
};

const releaseTag = process.env.npm_config_tag ?? 'latest';

( async () => {
	try {
		if ( ! config.gitAllowDirty ) {
			const status = await execAsync( 'git status --porcelain' );

			if ( status.split( EOL ).length > 0 ) {
				return bail( 'Git working directory is dirty. Please commit changes before publishing.' );
			}
		}

		if ( config.gitEnforceBranch && releaseTag === 'latest' ) {
			const currentBranch = await execAsync( 'git branch --show-current' );

			if ( currentBranch.trim() !== config.gitEnforceBranch ) {
				return bail(
					`Git branch is not ${ config.gitEnforceBranch }. Please switch to ${ config.gitEnforceBranch } before publishing.`
				);
			}
		}

		if ( config.nodeEnforceVersion ) {
			const supported = packageJSON.engines.node;
			const current = process.versions.node ?? process.version;
			const isSatisfied = satisfies( current, supported );

			if ( ! isSatisfied ) {
				return bail(
					`Node version ${ valid( current ) } is not supported. Please use Node version ${ valid(
						minVersion( supported )
					) } or higher.`
				);
			}
		}

		if ( config.testBeforePublish ) {
			console.log( 'Running tests before publishing...' );

			await execAsync( 'npm test', true );
		}

		process.exit( 0 );
	} catch ( error ) {
		bail( error );
	}
} )();

async function execAsync( command, pipe = false ) {
	const handle = exec( command );
	const stdout = [];
	const stderr = [];

	handle.stdout.on( 'data', data => {
		stdout.push( data.toString() );
	} );

	handle.stderr.on( 'data', data => {
		stderr.push( data.toString() );
	} );

	if ( pipe ) {
		handle.stdout.pipe( process.stdout );
		handle.stderr.pipe( process.stderr );
	}

	return new Promise( ( resolve, reject ) => {
		handle.on( 'close', code => {
			if ( code === 0 ) {
				resolve( stdout.join( '' ) );
			} else {
				reject( stderr.join( '' ) );
			}
		} );
	} );
}

function bail( message ) {
	console.error( message );
	process.exit( 1 );
}
