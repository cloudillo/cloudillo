const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	}
})
