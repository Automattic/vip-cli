const { configs } = require( '@automattic/eslint-plugin-wpvip' );

const config = [
	{
		ignores: [
			'*.generated.d.ts',
			'dist/**',
			'src/graphqlTypes.d.ts',
			'codegen.ts',
			// Go tree: fixtures for Go tests, not Node CLI source.
			'internal/**',
			'cmd/**',
			'scripts/**',
			'testdata/**',
			'third_party/**',
		],
	},
	...configs.recommended,
	...configs.cli,
	...configs.typescript,
	{
		rules: {
			'no-await-in-loop': 'warn',
			'no-console': 0,
			'security/detect-object-injection': 0,
			'security/detect-non-literal-fs-filename': 0,
			'promise/no-multiple-resolved': 0,
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'warn',
		},
	},
];

module.exports = config;
