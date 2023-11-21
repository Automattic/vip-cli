require( '@automattic/eslint-plugin-wpvip/init' );

module.exports = {
	extends: [
		'plugin:@automattic/wpvip/recommended',
		'plugin:@automattic/wpvip/cli',
		'plugin:@automattic/wpvip/weak-testing',
		'plugin:@automattic/wpvip/weak-typescript',
	],
	rules: {
		camelcase: 'warn',
		'jest/no-mocks-import': 'warn',
		'no-await-in-loop': 'warn',
		'no-unused-vars': 'warn',
		'no-console': 0,
		'security/detect-object-injection': 0,
		'security/detect-non-literal-fs-filename': 0,
		'promise/no-multiple-resolved': 0,
	},
};
