const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1'
	}
})
