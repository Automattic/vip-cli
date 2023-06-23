const util = require( 'node:util' );
const check = util.promisify( require( 'check-node-version' ) );
const { exec } = require( 'node:child_process' );
const { EOL } = require( 'node:os' );
const packageJSON = require( '../package.json' );

const config = {
	gitAllowDirty: true,
	gitBranch: 'trunk',
	nodeEnforceVersion: packageJSON.engines.node,
	testBeforePublish: true,
};

( async () => {
	try {
		if ( ! config.gitAllowDirty ) {
			const status = await execAsync( 'git status --porcelain' );

			if ( status.split( EOL ).length > 0 ) {
				return bail( 'Git working directory is dirty. Please commit changes before publishing.' );
			}
		}

		if ( config.gitBranch ) {
			const currentBranch = await execAsync( 'git branch --show-current' );

			if ( currentBranch.trim() !== config.gitBranch ) {
				return bail(
					`Git branch is not ${ config.gitBranch }. Please switch to ${ config.gitBranch } before publishing.`
				);
			}
		}

		if ( config.nodeEnforceVersion ) {
			const { isSatisfied, versions } = await check( { node: config.nodeEnforceVersion } );

			if ( ! isSatisfied ) {
				return bail(
					`Node version ${ versions.node.version } is not supported. Please use Node version ${ config.nodeEnforceVersion } or higher.`
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
