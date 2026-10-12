// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import hu from './i18n/hu/translation.json'

const resources = {
	en: { translation: {} },
	hu: { translation: hu }
}

i18n.use(initReactI18next)
	.init({
		resources,
		fallbackLng: 'en',
		keySeparator: '@',
		nsSeparator: '$',
		returnNull: false,
		interpolation: {
			escapeValue: false
		}
	})
	.catch()

export default i18n

// vim: ts=4
