/**
 * Worker budget for one jest process. Jest defaults to `availableParallelism() - 1`, and the
 * root `pnpm test` ran four of those at once — about 48 node processes on 12 cores.
 *
 * `'25%'` is jest's percentage form, `floor(cpus / 4)`, so it scales down to a small CI
 * runner instead of oversubscribing it. A quarter rather than a half because these suites
 * hit the thrash point early — every worker boots a VM under `--experimental-vm-modules` and
 * compiles TypeScript through ts-jest — so the full run measured *faster* at 3 workers than
 * at 6 (1m07s vs 1m18s) for half the CPU time (4m12s vs 7m57s).
 *
 * Override for a one-off run: `JEST_MAX_WORKERS=100% pnpm -C shell test`.
 */
const maxWorkers = process.env.JEST_MAX_WORKERS || '25%'

/** Shared Jest base for all workspace packages. Override per package as needed. */
module.exports = function createJestConfig(overrides = {}) {
	return {
		maxWorkers,
		preset: 'ts-jest/presets/default-esm',
		testEnvironment: 'node',
		roots: ['<rootDir>/src'],
		testMatch: ['**/__tests__/**/*.test.ts'],
		extensionsToTreatAsEsm: ['.ts'],
		// A package overriding this must respread the `.js` mapping - `...overrides`
		// replaces the whole object rather than merging into it.
		moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
		moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
		transform: {
			'^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.test.json' }]
		},
		testPathIgnorePatterns: ['/node_modules/'],
		...overrides
	}
}

// `maxWorkers` is a *global* jest option: `groupOptions()` in jest-config sorts it into
// globalConfig, so a copy inside a `projects[]` entry is dropped. The two multi-project
// configs (shell/, apps/notillo/) read it from here and set it on their outer object.
module.exports.maxWorkers = maxWorkers
