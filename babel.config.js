module.exports = {
	presets: [
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
	ignore: [ './src/prepare-config.js' ],
};
