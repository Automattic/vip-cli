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
				targets: {
					node: '16', // Keep this in sync with package.json engines.node
				},
			},
		],
	],
	ignore: [ '**/*.d.ts' ],
};
