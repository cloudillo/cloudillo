const typescriptTransform = require('i18next-scanner-typescript');

module.exports = {
	input: [
		'src/**/*.{ts,tsx}',
		'../libs/react/src/**/*.{ts,tsx}'
	],
	options: {
		//removeUnusedKeys: true,
		removeUnusedKeys: (lng, ns, key) => (console.log('UNUSED:', lng, ns, key), false),
		lngs: ['hu'],
		keySeparator: '$',
		nsSeparator: '#',
		func: {
			list: ['t'],
		},
		resource: {
			loadPath: 'src/i18n/{{lng}}/{{ns}}.json',
			savePath: 'src/i18n/{{lng}}/{{ns}}.json'
		},
		trans: {
			supportBasicHtmlNodes: true,
			keepBasicHtmlNodesFor: ['br', 'b', 'i', 'p']
		}
		//debug: true
	},
	transform: typescriptTransform(),
}

// vim: ts=4
