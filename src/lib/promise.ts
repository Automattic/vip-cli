export const createExternalizedPromise = < T >(): {
	promise: Promise< T >;
	resolve: ( value: T ) => void;
	reject: ( reason?: Error ) => void;
} => {
	let externalResolve: ( ( value: T ) => void ) | null = null;
	let externalReject: ( ( reason?: Error ) => void ) | null = null;
	const externalizedPromise = new Promise< T >( ( resolve, reject ) => {
		externalResolve = resolve;
		externalReject = reject;
	} );

	if ( ! externalReject || ! externalResolve ) {
		throw new Error( "Somehow, externalReject or externalResolve didn't get set." );
	}

	return {
		promise: externalizedPromise,
		resolve: externalResolve,
		reject: externalReject,
	};
};
