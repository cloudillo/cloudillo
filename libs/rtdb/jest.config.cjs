module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	moduleNameMapper: {
		'^~/(.*)$': '<rootDir>/$1',
		'(.+)\\.js$': '$1'
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', {
			tsconfig: {
				target: 'es2020',
				module: 'commonjs',
				moduleResolution: 'node',
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
				strict: true,
				skipLibCheck: true,
				forceConsistentCasingInFileNames: true,
				lib: ['es2020']
			},
			isolatedModules: true
		}],
		'^.+\\.jsx?$': ['ts-jest', {
			tsconfig: {
				module: 'commonjs'
			},
			isolatedModules: true
		}]
	},
	testPathIgnorePatterns: ['/node_modules/'],
	transformIgnorePatterns: [
		'node_modules/(?!(@symbion|@cloudillo)/)'
	]
}
