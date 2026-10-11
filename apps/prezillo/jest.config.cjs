const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	// pdf-export pulls in Quill (via canvas-text), which touches `document` at module scope
	testEnvironment: 'jsdom',
	setupFiles: ['<rootDir>/jest.setup.cjs'],
	moduleNameMapper: {
		// Its `main` is a UMD build in a `"type": "module"` package: no named ESM exports
		'^svg2pdf\\.js$': 'svg2pdf.js/dist/svg2pdf.es.min.js',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	extensionsToTreatAsEsm: ['.ts', '.tsx']
})
