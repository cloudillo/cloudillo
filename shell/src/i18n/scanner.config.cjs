const typescriptTransform = require('i18next-scanner-typescript')

module.exports = {
	input: [
		'src/**/*.{ts,tsx}',
		'../libs/react/src/**/*.{ts,tsx}',
		// Tests hold no translatable strings, and their top-level `await import()`
		// trips the scanner's parser.
		'!**/__tests__/**'
	],
	options: {
		//removeUnusedKeys: true,
		removeUnusedKeys: (lng, ns, key) => {
			console.log('UNUSED:', lng, ns, key)
			return false
		},
		lngs: ['hu'],
		keySeparator: '$',
		nsSeparator: '#',
		func: {
			list: ['t']
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
		//debug: true
	},
	transform: typescriptTransform()
}

// vim: ts=4
