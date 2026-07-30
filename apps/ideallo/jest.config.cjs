const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	// A test that imports a component (the GhostShapes/GhostEditing awareness guards) pulls in
	// ObjectRenderer, and Quill touches `document` at module scope. The per-file
	// `@jest-environment` pragma cannot be used here: jest-docblock only reads a leading block
	// comment, and every file in this repo opens with the two SPDX line comments.
	testEnvironment: 'jsdom',
	setupFiles: ['<rootDir>/jest.setup.cjs'],
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	// The app's components are ESM too, so a test that imports one (GhostShapes' awareness
	// guard) does not get it loaded through the CJS require path
	extensionsToTreatAsEsm: ['.ts', '.tsx'],
	// The base config matches `.test.ts` only, so a rendering test - which has to be `.tsx` - was
	// silently skipped despite the ESM config above already anticipating one
	testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']
})
