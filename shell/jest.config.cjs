const createJestConfig = require('../jest.config.base.cjs')

const shared = {
	// `.tsx` too, not just the base's `.ts`: a suite that imports one (pwa.tsx)
	// otherwise loads it through the CJS loader, where `unstable_mockModule` has
	// nothing to intercept.
	extensionsToTreatAsEsm: ['.ts', '.tsx'],
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		// The core subpath exports (`/jwt`, `/base64`) resolve through the
		// package's `exports` map, which jest's resolver does not read. Point
		// them at the sources so a test doesn't need libs/core built first.
		'^@cloudillo/core/(.*)$': '<rootDir>/../libs/core/src/$1.ts',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	}
}

// Two environments, split by file extension. Almost every suite here is pure
// logic and runs under node — where `crypto.subtle` and the real `indexedDB`
// fakes behave — but a React hook needs a document to render into. The per-file
// `@jest-environment` pragma cannot do the split: jest-docblock only reads a
// leading block comment, and every file in this repo opens with the two SPDX
// line comments. So `.test.tsx` means "needs a DOM".
module.exports = {
	projects: [
		createJestConfig({
			...shared,
			displayName: 'node',
			testMatch: ['**/__tests__/**/*.test.ts']
		}),
		createJestConfig({
			...shared,
			displayName: 'dom',
			testEnvironment: 'jsdom',
			// jsdom lacks TextEncoder/TextDecoder, so JWT payloads decode to null
			// there unless this runs first — a suite asserting on renewal
			// schedules would otherwise pass for entirely the wrong reason.
			setupFiles: ['<rootDir>/jest.setup.cjs'],
			testMatch: ['**/__tests__/**/*.test.tsx']
		})
	]
}
