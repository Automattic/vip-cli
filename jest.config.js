module.exports = {
	testEnvironment: 'jsdom',
	setupFiles: [
		'./jest.setup.js',
		'./jest.setupMocks.js',
	],
	testEnvironmentOptions: {
		url: 'http://localhost/',
	},
	maxWorkers: 4,
};
