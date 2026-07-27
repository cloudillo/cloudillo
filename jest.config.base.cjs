/** Shared Jest base for all workspace packages. Override per package as needed. */
module.exports = function createJestConfig(overrides = {}) {
	return {
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
