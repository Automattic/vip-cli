export function isStandaloneExecutableRuntime(): boolean {
	return Boolean(
		( globalThis as typeof globalThis & { Bun?: { isStandaloneExecutable?: boolean } } ).Bun
			?.isStandaloneExecutable
	);
}

export function getRuntimeModeLabel(): string {
	return isStandaloneExecutableRuntime() ? 'bun-standalone' : 'node-script';
}
