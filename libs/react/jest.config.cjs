const createJestConfig = require('../../jest.config.base.cjs')

module.exports = createJestConfig({
	testEnvironment: 'jsdom',
	// jsdom lacks TextEncoder/TextDecoder, which react-router needs at import time.
	setupFiles: ['<rootDir>/jest.setup.cjs'],
	// Component tests are `.tsx`; the base config only knows about `.ts`.
	testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
	extensionsToTreatAsEsm: ['.ts', '.tsx'],
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	}
})
