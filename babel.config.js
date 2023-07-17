module.exports = {
	presets: [
		'@babel/preset-flow',
		[
			'@babel/preset-typescript',
			{
				allowDeclareFields: true,
			},
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
				root: [ './src' ],
				alias: {
					root: './',
				},
			},
		],
	],
	ignore: [ '**/*.d.ts' ],
};
