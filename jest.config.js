module.exports = {
	setupFiles: [ './jest.setup.js', './jest.setupMocks.js' ],
	maxWorkers: 4,
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
