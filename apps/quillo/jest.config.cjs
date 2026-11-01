const createJestConfig = require('../../jest.config.base.cjs')

// jsdom for Quill itself (import-markdown undo test); jsdom lacks TextEncoder,
// which docx's Packer needs (export-docx test), so reuse the react lib's polyfill.
module.exports = createJestConfig({
	testEnvironment: 'jsdom',
	setupFiles: ['<rootDir>/../../libs/react/jest.setup.cjs']
})
