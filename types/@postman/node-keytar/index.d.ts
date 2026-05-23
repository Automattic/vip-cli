declare module '@postman/node-keytar' {
	interface KeytarModule {
		getPassword( service: string, account: string ): Promise< string | null >;
		setPassword( service: string, account: string, password: string ): Promise< void >;
		deletePassword( service: string, account: string ): Promise< boolean >;
	}

	const keytar: KeytarModule;
	export default keytar;
}
