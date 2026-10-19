module.exports = {
	plugins: [ [ '@babel/plugin-transform-modules-commonjs', { loose: true } ] ],
	presets: [
		[
			'@babel/preset-typescript',
			{
				allowDeclareFields: true,
			},
		],
	],
	ignore: [ '**/*.d.ts' ],
};
