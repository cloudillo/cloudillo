// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useTranslation } from 'react-i18next'

type TFunction = (key: string, options?: Record<string, unknown>) => string

/**
 * A wrapper around useTranslation that falls back to returning the key
 * (which should be English text) if i18n is not initialized.
 */
export function useLibTranslation(): { t: TFunction } {
	try {
		// biome-ignore lint/correctness/useHookAtTopLevel: hook in try/catch for graceful degradation when i18n is not initialized
		const { t, i18n } = useTranslation()
		if (i18n.isInitialized) {
			return { t: t as TFunction }
		}
	} catch {
		// i18n not available
	}
	// Fallback: return identity function (key is English text)
	return { t: (key: string) => key }
}

// vim: ts=4
