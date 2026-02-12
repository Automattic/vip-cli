import { isAlias } from './envAlias';
import { internalBinNames } from './internal-bin-loader';

const internalBinSet = new Set( internalBinNames );

/**
 * Resolve the best matching internal bin for a command argv.
 *
 * @param {string[]} argv process.argv style array
 * @returns {{ bin: string, start: number, length: number }}
 */
export function resolveInternalBinFromArgv( argv ) {
	const args = argv.slice( 2 );
	const dashDashIndex = args.indexOf( '--' );
	const commandBoundary = dashDashIndex > -1 ? dashDashIndex : args.length;

	let best = {
		bin: 'vip',
		start: 0,
		length: 0,
	};

	for ( let start = 0; start < commandBoundary; start++ ) {
		const firstToken = args[ start ];
		if ( ! firstToken || firstToken.startsWith( '-' ) || isAlias( firstToken ) ) {
			continue;
		}

		const commandParts = [];

		for ( let index = start; index < commandBoundary; index++ ) {
			const token = args[ index ];
			if ( ! token || token.startsWith( '-' ) || isAlias( token ) ) {
				break;
			}

			commandParts.push( token );

			const candidateBin = `vip-${ commandParts.join( '-' ) }`;
			if ( internalBinSet.has( candidateBin ) ) {
				const isLongerMatch = commandParts.length > best.length;
				const isEarlierEqualMatch =
					commandParts.length === best.length && commandParts.length > 0 && start < best.start;

				if ( isLongerMatch || isEarlierEqualMatch ) {
					best = {
						bin: candidateBin,
						start,
						length: commandParts.length,
					};
				}
			}
		}
	}

	return best;
}

/**
 * Rewrites argv so the resolved command segment is removed and the target bin
 * can parse its native flags/args shape.
 *
 * @param {string[]} argv process.argv style array
 * @param {{ start: number, length: number }} resolution command resolution
 * @returns {string[]} rewritten argv
 */
export function rewriteArgvForInternalBin( argv, resolution ) {
	const args = argv.slice( 2 );
	const start = resolution.start ?? 0;
	const length = resolution.length ?? 0;

	if ( length <= 0 ) {
		return argv.slice( 0 );
	}

	const rewrittenArgs = args.slice( 0, start ).concat( args.slice( start + length ) );
	return [ argv[ 0 ], argv[ 1 ], ...rewrittenArgs ];
}

/**
 * @returns {boolean}
 */
export function isSeaRuntime() {
	try {
		const runtimeRequire =
			typeof module !== 'undefined' && module?.require ? module.require.bind( module ) : null;
		if ( ! runtimeRequire ) {
			return false;
		}

		const sea = runtimeRequire( 'node:sea' );
		return Boolean( sea?.isSea?.() );
	} catch {
		return false;
	}
}
