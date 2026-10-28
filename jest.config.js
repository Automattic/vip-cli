module.exports = {
	setupFiles: [ './jest.setup.js', './jest.setupMocks.js' ],
	maxWorkers: 4,
	transform: { '^.+\\.m?[tj]sx?$': [ 'ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' } ] },
	transformIgnorePatterns: [],
	resolver: '<rootDir>/jest.resolver.js',
};
