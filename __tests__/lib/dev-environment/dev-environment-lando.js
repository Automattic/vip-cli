import { expect } from '@jest/globals';
import ejs from 'ejs';
import * as yaml from 'js-yaml';
import path from 'node:path';

const templatePath = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'assets',
	'dev-env.lando.template.yml.ejs'
);

const baseTemplateData = {
	siteSlug: 'my-site',
	domain: 'vipdev.lndo.site',
	multisite: false,
	phpmyadmin: true,
	mailpit: true,
	elasticsearch: false,
	photon: false,
	xdebug: false,
	xdebugConfig: undefined,
	autologinKey: undefined,
	cron: false,
	mariadb: false,
	php: 'ghcr.io/automattic/vip-container-images/php:8.2',
	wpTitle: 'My Site',
	adminPassword: 'password',
	wordpress: { mode: 'image', tag: '6.5' },
};

async function renderTemplate( overrides ) {
	const rendered = await ejs.renderFile( templatePath, { ...baseTemplateData, ...overrides } );
	return yaml.load( rendered );
}

function getInitOnlyServiceNames( config ) {
	return Object.keys( config.services ).filter(
		serviceName => config.services[ serviceName ].initOnly
	);
}

function getWpMountTargets( config ) {
	const targets = new Set();
	Object.values( config.services ).forEach( service => {
		const volumes = service.services?.volumes ?? [];
		volumes.forEach( volume => {
			const target = typeof volume === 'string' ? volume.split( ':' )[ 1 ] : volume.target;
			if ( target?.startsWith( '/wp/' ) ) {
				targets.add( target.slice( '/wp/'.length ) );
			}
		} );
	} );
	return [ ...targets ];
}

describe( 'assets/dev-env.lando.template.yml.ejs', () => {
	it.each( [
		[
			'image mode (mu-plugins + app-code images)',
			{ muPlugins: { mode: 'image' }, appCode: { mode: 'image' } },
		],
		[
			'local mode (mu-plugins + app-code directories)',
			{
				muPlugins: { mode: 'local', dir: './mu-plugins' },
				appCode: { mode: 'local', dir: './app-code' },
			},
		],
	] )(
		'no initOnly service dependency waits only for service_started (%s)',
		async ( _label, overrides ) => {
			const config = await renderTemplate( overrides );
			const initOnlyServices = getInitOnlyServiceNames( config );

			expect( initOnlyServices ).toEqual( expect.arrayContaining( [ 'wordpress' ] ) );

			const initOnlyDependencies = Object.entries( config.services ).flatMap(
				( [ serviceName, service ] ) => {
					const dependsOn = service.services?.depends_on ?? {};
					return Object.entries( dependsOn )
						.filter( ( [ dependencyName ] ) => initOnlyServices.includes( dependencyName ) )
						.map( ( [ dependencyName, dependency ] ) => ( {
							service: serviceName,
							dependsOn: dependencyName,
							condition: dependency.condition,
						} ) );
				}
			);

			expect( initOnlyDependencies.length ).toBeGreaterThan( 0 );
			initOnlyDependencies.forEach( entry => {
				expect( entry.condition ).toBe( 'service_completed_successfully' );
			} );
		}
	);

	it.each( [
		[
			'image mode (mu-plugins + app-code images)',
			{ muPlugins: { mode: 'image' }, appCode: { mode: 'image' } },
		],
		[
			'local mode (mu-plugins + app-code directories)',
			{
				muPlugins: { mode: 'local', dir: './mu-plugins' },
				appCode: { mode: 'local', dir: './app-code' },
			},
		],
	] )(
		"the init container's rsync never deletes a sibling service's mount target (%s)",
		async ( _label, overrides ) => {
			const config = await renderTemplate( overrides );
			const wpMountTargets = getWpMountTargets( config );

			expect( wpMountTargets.length ).toBeGreaterThan( 0 );

			const entrypoint = config.services.wordpress.entrypoint;

			wpMountTargets.forEach( target => {
				expect( entrypoint ).toContain( `--exclude=/${ target }` );
			} );
		}
	);
} );
