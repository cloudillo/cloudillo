const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	testEnvironment: 'jsdom',
	setupFiles: ['<rootDir>/jest.setup.cjs'],
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	}
})
