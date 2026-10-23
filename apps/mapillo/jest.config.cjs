const createJestConfig = require('../../jest.config.base.cjs')

// jsdom for `DOMParser` (sanitizeAttribution)
module.exports = createJestConfig({ testEnvironment: 'jsdom' })
