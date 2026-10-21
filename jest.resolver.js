module.exports = ( request, options ) => {
	// Babel turns Lando's ESM bridge into require(), but string-argv only exports
	// an import entry. Keep this condition local to that package.
	if ( request === 'string-argv' ) {
		return options.defaultResolver( request, {
			...options,
			conditions: [
				...( options.conditions ?? [] ).filter( condition => condition !== 'require' ),
				'import',
			],
		} );
	}

	return options.defaultResolver( request, options );
};
