module.exports = {
	setupFiles: [ './jest.setup.js', './jest.setupMocks.js' ],
	maxWorkers: 4,
	transformIgnorePatterns: [],
	resolver: '<rootDir>/jest.resolver.js',
};
