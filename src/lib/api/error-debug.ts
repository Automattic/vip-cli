export function safeGraphQLErrorDebugInfo(
	operation: string,
	errors: readonly {
		path?: readonly ( string | number )[];
		extensions?: Record< string, unknown >;
	}[]
) {
	return errors.map( error => {
		const code = error.extensions?.code;

		return {
			operation,
			path: error.path ?? [],
			...( typeof code === 'string' ? { code } : {} ),
		};
	} );
}
