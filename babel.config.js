module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				targets: {
					node: '12', // Keep this in sync with package.json engines.node
				},
			},
		],
		'@babel/preset-flow',
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
};
