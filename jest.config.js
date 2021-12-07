module.exports = {
	testEnvironment: 'jsdom',
	setupFiles: [
		'./jest.setup.js',
		'./jest.setupMocks.js',
	],
	testURL: 'http://localhost/',
	maxWorkers: 4,
};
