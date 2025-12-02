module.exports = {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				useESM: true,
				tsconfig: {
					target: 'es2020',
					module: 'esnext',
					moduleResolution: 'bundler',
					esModuleInterop: true,
					allowSyntheticDefaultImports: true,
					strict: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
					lib: ['es2020']
				}
			}
		]
	},
	testPathIgnorePatterns: ['/node_modules/'],
	transformIgnorePatterns: []
}
