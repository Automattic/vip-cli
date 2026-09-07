import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify( execFile );

export type ContainerEngine = 'docker' | 'podman';

export interface EngineInfo {
	engine: ContainerEngine;
	serverVersion: string;
	composePlugin?: string;
	socketPath: string;
	rootless: boolean;
}

type ExecFn = typeof execFileAsync;

const fallbackEngineInfo = ( socketPath: string ): EngineInfo => ( {
	engine: 'docker',
	serverVersion: 'unknown',
	socketPath,
	rootless: false,
} );

const isRecord = ( value: unknown ): value is Record< string, unknown > =>
	typeof value === 'object' && value !== null;

const isDockerShape = (
	info: Record< string, unknown >
): info is Record< string, unknown > & { ServerVersion: string } =>
	typeof info.ServerVersion === 'string';

const isPodmanShape = ( info: Record< string, unknown > ): boolean => {
	const version = info.version;
	const host = info.host;
	const store = info.store;

	const hasVersion = isRecord( version ) && typeof version.Version === 'string';
	const hasPodmanHostShape = isRecord( host ) && 'remoteSocket' in host;
	const hasPodmanStoreShape = isRecord( store ) && typeof store.graphDriverName === 'string';

	return hasVersion && ( hasPodmanHostShape || hasPodmanStoreShape );
};

const findComposePluginVersion = ( info: Record< string, unknown > ): string | undefined => {
	const clientInfo = info.ClientInfo;
	if ( ! isRecord( clientInfo ) ) {
		return undefined;
	}

	const plugins: unknown = clientInfo.Plugins;
	if ( ! Array.isArray( plugins ) ) {
		return undefined;
	}

	const composePlugin: unknown = ( plugins as unknown[] ).find(
		plugin => isRecord( plugin ) && plugin.Name === 'compose'
	);

	return isRecord( composePlugin ) && typeof composePlugin.Version === 'string'
		? composePlugin.Version
		: undefined;
};

const isPodmanRootless = ( info: Record< string, unknown > ): boolean => {
	const host = info.host;
	if ( ! isRecord( host ) ) {
		return false;
	}

	const security = host.security;
	return isRecord( security ) && security.rootless === true;
};

const parseDockerInfo = ( info: Record< string, unknown >, socketPath: string ): EngineInfo => ( {
	engine: 'docker',
	serverVersion: info.ServerVersion as string,
	composePlugin: findComposePluginVersion( info ),
	socketPath,
	rootless: false,
} );

const parsePodmanInfo = ( info: Record< string, unknown >, socketPath: string ): EngineInfo => {
	const version = info.version as Record< string, unknown >;
	return {
		engine: 'podman',
		serverVersion: version.Version as string,
		composePlugin: findComposePluginVersion( info ),
		socketPath,
		rootless: isPodmanRootless( info ),
	};
};

export async function detectEngine(
	dockerBin: string,
	socketPath: string,
	exec: ExecFn = execFileAsync
): Promise< EngineInfo > {
	try {
		const { stdout } = await exec( dockerBin, [ 'info', '--format', 'json' ] );
		const info: unknown = JSON.parse( String( stdout ) );

		if ( ! isRecord( info ) ) {
			return fallbackEngineInfo( socketPath );
		}

		if ( isDockerShape( info ) ) {
			return parseDockerInfo( info, socketPath );
		}

		if ( isPodmanShape( info ) ) {
			return parsePodmanInfo( info, socketPath );
		}

		return fallbackEngineInfo( socketPath );
	} catch {
		return fallbackEngineInfo( socketPath );
	}
}
