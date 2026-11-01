// Shared i18next-scanner config for the apps and libs/react. Paths resolve against the cwd
// (the package dir). libs/react has its own bundle, merged under the app's by initAppI18n.
// Used directly: `i18next-scanner --config ../../scripts/i18n-scanner.base.cjs`. The TypeScript
// transform resolves from the scanned package's node_modules (pnpm does not hoist it to the root).

module.exports = {
	transform: require(require.resolve('i18next-scanner-typescript', { paths: [process.cwd()] }))(),
	input: ['src/**/*.{ts,tsx}', '!**/__tests__/**'],
	options: {
		// Unused keys are kept on purpose (strings may come back, or be used outside src/)
		removeUnusedKeys: () => false,
		lngs: ['hu'],
		keySeparator: '@',
		nsSeparator: '$',
		func: {
			// N_ marks a string stored in a variable and translated later with t()
			list: ['t', 'N_']
		},
		resource: {
			loadPath: 'src/i18n/{{lng}}/{{ns}}.json',
			savePath: 'src/i18n/{{lng}}/{{ns}}.json',
			jsonIndent: '\t'
		},
		trans: {
			supportBasicHtmlNodes: true,
			keepBasicHtmlNodesFor: ['br', 'b', 'i', 'p']
		}
	}
}

// vim: ts=4
