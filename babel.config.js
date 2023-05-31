module.exports = {
	presets: [
		'@babel/preset-flow',
		[
			"@babel/preset-typescript",
			{
				"allowDeclareFields": true
			}
		],
		[
			'@babel/preset-env',
			{
				targets: {
					node: '12', // Keep this in sync with package.json engines.node
				},
			},
		],
	],
	plugins: [
		'@babel/plugin-transform-modules-commonjs',
		[
			'module-resolver',
			{
				root: [
					'./src',
				],
				alias: {
					root: './',
				},
			},
		],
	],
	env: {
		test: {
			// see https://github.com/facebook/jest/issues/936#issuecomment-821944391
			// Jest has no good way of partially mocking a module
			plugins: ['explicit-exports-references']
		}
	},
	ignore: [
		"**/*.d.ts"
	]
};
