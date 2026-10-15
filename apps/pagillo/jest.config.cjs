const createJestConfig = require('../../jest.config.base.cjs')

// `ui/LengthInput.tsx` is imported by a test; the base config only treats `.ts` as ESM.
const shared = { extensionsToTreatAsEsm: ['.ts', '.tsx'] }

// `.test.tsx` means "needs a DOM" (see shell/jest.config.cjs: the SPDX header keeps the
// per-file `@jest-environment` pragma from being read).
module.exports = {
	maxWorkers: createJestConfig.maxWorkers,
	projects: [
		createJestConfig({ ...shared, displayName: 'node' }),
		createJestConfig({
			...shared,
			displayName: 'dom',
			testEnvironment: 'jsdom',
			// TextEncoder for react-router, which `view/PageList.tsx` reaches through @cloudillo/react.
			setupFiles: ['<rootDir>/../../libs/react/jest.setup.cjs'],
			testMatch: ['**/__tests__/**/*.test.tsx']
		})
	]
}
