const createJestConfig = require('../../jest.config.base.cjs')

// Two environments, split by file extension: `.test.tsx` means "needs a DOM".
// The per-file `@jest-environment` pragma cannot do the split, because
// jest-docblock only reads a leading *block* comment and every file here opens
// with the two SPDX line comments.
module.exports = {
	maxWorkers: createJestConfig.maxWorkers,
	projects: [
		createJestConfig({ displayName: 'node' }),
		createJestConfig({
			displayName: 'dom',
			testEnvironment: 'jsdom',
			extensionsToTreatAsEsm: ['.ts', '.tsx'],
			testMatch: ['**/__tests__/**/*.test.tsx']
		})
	]
}
