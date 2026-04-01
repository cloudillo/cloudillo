// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import hu from './i18n/hu/translation.json'

const resources = {
	en: { translation: {} },
	hu: { translation: hu }
}

i18n.use(initReactI18next)
	.use(LanguageDetector as Parameters<typeof i18n.use>[0])
	.init({
		resources,
		fallbackLng: 'en',
		keySeparator: '@',
		nsSeparator: '$',
		returnNull: false,
		interpolation: {
			//escapeValue: false,
			format: (value, rawFormat, lng) => {
				if (rawFormat) {
					const [format, ...additionalValues] = rawFormat.split(',').map((v) => v.trim())
					switch (format) {
						case 'uppercase':
							return value.toUpperCase()
						case 'number':
							return typeof value == 'number'
								? Intl.NumberFormat(lng).format(value)
								: additionalValues[0] || '-'
						case 'price':
							return typeof value == 'number'
								? Intl.NumberFormat(lng).format(value) + '-'
								: additionalValues[0] || '-'
					}
				}
			}
		}
	})
	.catch()

export default i18n

// vim: ts=4
