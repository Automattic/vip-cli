#!/usr/bin/env node

import { appQuery } from '../lib/api/edge-workers';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { formatData } from '../lib/cli/format';
import {
	confirmProductionEdgeWorkerMutation,
	isInteractiveEdgeWorkers,
} from '../lib/edge-workers/confirmation';
import {
	applyEdgeWorkerDeploymentPlan,
	DeploymentApplyError,
	deploymentPlanRows,
	prepareEdgeWorkerDeploymentPlan,
} from '../lib/edge-workers/deployment';
import { discoverWorkers, findWorker, resolveProjectDir } from '../lib/edge-workers/project';
import { confirm } from '../lib/envvar/input';
import { trackEventWithEnv } from '../lib/tracker';

const usage = 'vip edge-workers deploy';

const examples = [
	{
		usage: 'vip @example-app.develop edge-workers deploy my-worker',
		description: 'Compile and deploy a single worker to the develop environment.',
	},
	{
		usage: 'vip @example-app.develop edge-workers deploy --all',
		description: 'Compile and deploy every worker in the project.',
	},
	{
		usage: 'vip @example-app.develop edge-workers deploy my-worker --skip-build',
		description: 'Deploy a previously compiled artifact without recompiling.',
	},
];

function errorMessage( error ) {
	return error instanceof Error ? error.message : String( error );
}

function partialFailureMessage( error ) {
	return (
		`Deployment stopped at "${ error.failedName }". ` +
		`Applied: ${ error.appliedNames.join( ', ' ) || 'none' }. ` +
		`Not applied: ${ error.unappliedNames.join( ', ' ) || 'none' }. ` +
		`Cause: ${ errorMessage( error.cause ) }`
	);
}

export async function edgeWorkersDeployCommand( args = [], opt = {} ) {
	const { app, env } = opt;
	const name = args[ 0 ];

	await trackEventWithEnv( app.id, env.id, 'edge_workers_deploy_command_execute', {
		name,
		all: Boolean( opt.all ),
	} );

	try {
		if ( name && opt.all ) {
			throw new Error( 'Supply either a worker name or --all, not both.' );
		}

		const projectDir = resolveProjectDir( { path: opt.path } );

		let workers;
		if ( opt.all ) {
			workers = discoverWorkers( projectDir );
			if ( ! workers.length ) {
				throw new Error( 'No workers found in this project.' );
			}
		} else if ( name ) {
			workers = [ findWorker( projectDir, name ) ];
		} else {
			throw new Error( 'Please supply a worker name to deploy, or pass `--all`.' );
		}

		const plan = await prepareEdgeWorkerDeploymentPlan( {
			appId: app.id,
			envId: env.id,
			projectDir,
			workers,
			skipBuild: Boolean( opt.skipBuild ),
			skipValidate: Boolean( opt.skipValidate ),
			skipSource: Boolean( opt.skipSource ),
		} );

		console.log( formatData( deploymentPlanRows( plan ), 'table' ) );

		await confirmProductionEdgeWorkerMutation(
			{
				action: 'deploy',
				appName: app.name,
				envType: env.type,
				workerNames: plan.map( item => item.worker.manifest.name ),
				skipConfirmation: Boolean( opt.skipConfirmation ),
				nonInteractive: ! isInteractiveEdgeWorkers( opt ),
			},
			confirm
		);

		await applyEdgeWorkerDeploymentPlan( env.id, plan, ( item, deployed ) => {
			const action = item.action === 'create' ? 'created' : 'updated';
			const phasesNote = `, phases: ${ deployed.phases.join( ', ' ) || 'none' }`;
			console.log(
				`✓ ${ action } "${ item.worker.manifest.name }" ` +
					`(${ item.artifact.sizeBytes } bytes${ phasesNote })`
			);
		} );

		await trackEventWithEnv( app.id, env.id, 'edge_workers_deploy_command_success', {
			count: plan.length,
		} );
	} catch ( err ) {
		await trackEventWithEnv( app.id, env.id, 'edge_workers_deploy_command_error', {
			name,
			error: errorMessage( err ),
		} );
		exit.withError(
			err instanceof DeploymentApplyError
				? partialFailureMessage( err )
				: `Failed to deploy edge worker: ${ errorMessage( err ) }`
		);
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage,
} )
	.option( 'path', 'Path to the edge-workers project. Defaults to auto-discovery.' )
	.option( 'all', 'Deploy every worker in the project.', false )
	.option( 'skip-build', 'Deploy a previously compiled artifact without recompiling.', false )
	.option( 'skip-validate', 'Skip server-side dry-run validation before uploading.', false )
	.option(
		'skip-source',
		'Do not store source on create; preserve stored source on update.',
		false
	)
	.option( 'skip-confirmation', 'Skip the production deployment confirmation.', false )
	.examples( examples )
	.argv( process.argv, edgeWorkersDeployCommand );
