import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { satisfies } from 'semver';

const execFileAsync = promisify( execFile );

export type ContainerEngine = 'docker' | 'podman';

export interface EngineInfo {
	engine: ContainerEngine;
	serverVersion: string;
	composePlugin?: string;
	composeBinaryVersion?: string;
	socketPath: string;
	rootless: boolean;
}

export type ComposeRequirementResult = { ok: true } | { ok: false; reason: string; remedy: string };

export interface PreflightProbes {
	unprivilegedPortStartAllowsPort80: boolean;
	isPodmanMacMachine: boolean;
}

export type PreflightSeverity = 'error' | 'warning';

export interface PreflightFinding {
	severity: PreflightSeverity;
	message: string;
	remedy: string;
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

const DOCKER_COMPOSE_INSTALL_REMEDY =
	'Install the standalone docker-compose v2 binary: https://docs.docker.com/compose/install/';

export function composeRequirement( info: EngineInfo ): ComposeRequirementResult {
	if ( info.engine !== 'podman' ) {
		return { ok: true };
	}

	const composeBinaryVersion = info.composeBinaryVersion;
	if ( ! composeBinaryVersion ) {
		return {
			ok: false,
			reason:
				'podman does not ship a Compose v2-compatible docker-compose, and no standalone docker-compose binary was found',
			remedy: DOCKER_COMPOSE_INSTALL_REMEDY,
		};
	}

	if ( ! satisfies( composeBinaryVersion, '>=2.0.0' ) ) {
		return {
			ok: false,
			reason: `docker-compose version ${ composeBinaryVersion } is not Compose v2`,
			remedy: DOCKER_COMPOSE_INSTALL_REMEDY,
		};
	}

	return { ok: true };
}

const UNPRIVILEGED_PORT_SYSCTL_KEY = 'net.ipv4.ip_unprivileged_port_start';

const macMachineUnprivilegedPortRemedy = () =>
	`Run inside the podman machine: podman machine ssh -- sudo sysctl -w ${ UNPRIVILEGED_PORT_SYSCTL_KEY }=80`;

const linuxHostUnprivilegedPortRemedy = () =>
	`Run on this host: sudo sysctl -w ${ UNPRIVILEGED_PORT_SYSCTL_KEY }=80 (persist it in /etc/sysctl.d/)`;

export type ProxyPublishAddress = '127.0.0.1' | '0.0.0.0';

export interface ProxySocketMount {
	source: string;
	target: '/var/run/docker.sock';
	selinuxLabelDisable: boolean;
}

const DOCKER_DEFAULT_SOCKET_PATH = '/var/run/docker.sock';
const PROXY_SOCKET_MOUNT_TARGET = '/var/run/docker.sock';
const SELINUX_ENFORCE_STATUS_PATH = '/sys/fs/selinux/enforce';
const SELINUX_ENFORCING_STATUS_VALUE = '1';

export function proxyPublishAddress( info: EngineInfo ): ProxyPublishAddress {
	return info.engine === 'podman' ? '0.0.0.0' : '127.0.0.1';
}

const isSelinuxEnforcingHost = (): boolean => {
	if ( process.platform !== 'linux' ) {
		return false;
	}

	try {
		return (
			readFileSync( SELINUX_ENFORCE_STATUS_PATH, 'utf8' ).trim() === SELINUX_ENFORCING_STATUS_VALUE
		);
	} catch {
		return false;
	}
};

export function proxySocketMount( info: EngineInfo ): ProxySocketMount {
	return {
		source: info.socketPath || DOCKER_DEFAULT_SOCKET_PATH,
		target: PROXY_SOCKET_MOUNT_TARGET,
		selinuxLabelDisable: info.engine === 'podman' && isSelinuxEnforcingHost(),
	};
}

export function podmanPreflight( info: EngineInfo, probes: PreflightProbes ): PreflightFinding[] {
	if ( info.engine !== 'podman' ) {
		return [];
	}

	if ( probes.unprivilegedPortStartAllowsPort80 ) {
		return [];
	}

	return [
		{
			severity: 'error',
			message: `podman cannot publish port 80 until ${ UNPRIVILEGED_PORT_SYSCTL_KEY } allows unprivileged ports below 1024`,
			remedy: probes.isPodmanMacMachine
				? macMachineUnprivilegedPortRemedy()
				: linuxHostUnprivilegedPortRemedy(),
		},
	];
}
