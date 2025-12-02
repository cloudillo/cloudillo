// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import hu from './i18n/hu/translation.json'

const resources = {
	en: { translation: {} },
	hu: { translation: hu }
}

i18n.use(initReactI18next)
	.use(LanguageDetector as any)
	.init({
		resources,
		fallbackLng: 'en',
		keySeparator: '@',
		nsSeparator: '$',
		returnNull: false,
		debug: true,
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
