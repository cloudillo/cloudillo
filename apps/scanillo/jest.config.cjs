const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	// `useBackStack` is a DOM hook — it drives `window.history` and listens for
	// popstate — so its suite needs a document to render into. The per-file
	// `@jest-environment` pragma cannot be used: jest-docblock only reads a leading
	// block comment, and every file in this repo opens with the two SPDX line
	// comments. The pure suites (refine-quad) are indifferent to the environment.
	testEnvironment: 'jsdom'
})
