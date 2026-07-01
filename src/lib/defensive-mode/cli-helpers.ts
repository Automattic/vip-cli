import chalk from 'chalk';

export function isInteractive( opt: { nonInteractive?: boolean } ): boolean {
	if ( process.env.VIP_NON_INTERACTIVE === '1' ) {
		return false;
	}
	if ( opt.nonInteractive ) {
		return false;
	}
	return Boolean( process.stdout.isTTY );
}

export interface ProductionGuardOptions {
	app: { name: string };
	env: { type: string };
	skipConfirmation?: boolean;
	nonInteractive?: boolean;
}

function capitalize( str: string ): string {
	return str.charAt( 0 ).toUpperCase() + str.slice( 1 );
}

/**
 * Guards production mutations that require confirmation. Returns true if the
 * command should proceed. In non-interactive contexts without
 * --skip-confirmation it emits an error and calls process.exit(1) directly.
 * If the user declines the interactive prompt it calls process.exit() directly.
 */
export async function guardProductionMutation(
	opt: ProductionGuardOptions,
	action: 'enable' | 'disable' | 'configure',
	trackingParams: Record< string, unknown >,
	confirmFn: ( message: string ) => Promise< boolean >,
	trackEventFn: ( event: string, props: Record< string, unknown > ) => Promise< void >,
	formatEnvironment: ( type: string ) => string
): Promise< void > {
	if ( opt.skipConfirmation || opt.env.type !== 'production' ) {
		return;
	}

	if ( ! isInteractive( opt ) ) {
		console.error(
			chalk.red(
				`Refusing to ${ action } defensive mode on production without confirmation. ` +
					'Pass --skip-confirmation to proceed non-interactively.'
			)
		);
		await trackEventFn( `defensive_mode_${ action }_command_cancelled`, trackingParams );
		process.exit( 1 );
	}

	const yes = await confirmFn(
		`${ capitalize( action ) } defensive mode on ${ formatEnvironment( opt.env.type ) } for ${
			opt.app.name
		}?`
	);

	if ( ! yes ) {
		await trackEventFn( `defensive_mode_${ action }_command_cancelled`, trackingParams );
		console.log( 'Command cancelled' );
		process.exit();
	}
}

/**
 * Handles success/failure reporting, telemetry, and log output after a
 * defensive-mode mutation. Exits the process on failure.
 */
export async function reportMutationResult(
	result: { success: boolean; message: string },
	trackingParams: Record< string, unknown >,
	action: 'enable' | 'disable' | 'configure',
	appName: string,
	envType: string,
	successVerb: string,
	failureVerb: string,
	trackEventFn: ( event: string, props: Record< string, unknown > ) => Promise< void >
): Promise< void > {
	if ( ! result.success ) {
		await trackEventFn( `defensive_mode_${ action }_command_error`, {
			...trackingParams,
			error: result.message,
		} );
		console.error( chalk.red( `Failed to ${ failureVerb }: ${ result.message }` ) );
		process.exit( 1 );
	}
	await trackEventFn( `defensive_mode_${ action }_command_success`, trackingParams );
	console.log(
		chalk.green( '✓' ),
		`Defensive mode ${ successVerb } for ${ appName }.${ envType } — ${ result.message }`
	);
}
