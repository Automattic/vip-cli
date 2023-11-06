module.exports = {
	presets: [
		[
			'@babel/preset-typescript',
			{
				allowDeclareFields: true,
			},
		],
		[
			'@babel/preset-env',
			{
				loose: true,
				exclude: [ '@babel/plugin-proposal-dynamic-import' ],
				targets: {
					node: '18', // Keep this in sync with package.json engines.node
				},
			},
		],
	],
	ignore: [ '**/*.d.ts' ],
};
