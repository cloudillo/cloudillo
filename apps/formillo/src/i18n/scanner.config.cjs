const typescriptTransform = require('i18next-scanner-typescript')

module.exports = {
	input: ['src/**/*.{ts,tsx}'],
	options: {
		lngs: ['hu'],
		keySeparator: '^',
		nsSeparator: '$',
		func: {
			list: ['t']
		},
		resource: {
			loadPath: 'src/i18n/{{lng}}/{{ns}}.json',
			savePath: 'src/i18n/{{lng}}/{{ns}}.json'
		}
		//debug: true
	},
	transform: typescriptTransform()
}

// vim: ts=4
