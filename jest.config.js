module.exports = {
	setupFiles: [ './jest.setup.js', './jest.setupMocks.js' ],
	maxWorkers: 4,
	transform: {
		'^.+\\.m?[tj]sx?$': [
			'ts-jest',
			// Type checking runs separately with `npm run check-types`. Diagnostics from
			// ts-jest's incremental per-worker program are inconsistent between runs.
			{ tsconfig: '<rootDir>/tsconfig.jest.json', diagnostics: false },
		],
	},
	transformIgnorePatterns: [],
	resolver: '<rootDir>/jest.resolver.js',
};
