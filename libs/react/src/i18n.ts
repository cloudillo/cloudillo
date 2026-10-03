// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Trans, useTranslation } from 'react-i18next'

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
	// Fallback: return identity function (key is English text) with basic {{name}} interpolation.
	return {
		t: (key: string, options?: Record<string, unknown>) =>
			options
				? key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? `{{${name}}}`))
				: key
	}
}

export interface LibTransProps {
	i18nKey: string
	components: Record<string, React.ReactElement>
	/** The English sentence, rendered as-is when i18n is not initialized. */
	children: React.ReactNode
}

/** `Trans` with the same fallback as `useLibTranslation`: the children, untranslated. */
export function LibTrans({ i18nKey, components, children }: LibTransProps): React.ReactElement {
	try {
		// biome-ignore lint/correctness/useHookAtTopLevel: hook in try/catch for graceful degradation when i18n is not initialized
		const { i18n } = useTranslation()
		if (i18n.isInitialized) {
			return React.createElement(Trans, { i18nKey, components }, children)
		}
	} catch {
		// i18n not available
	}
	return React.createElement(React.Fragment, null, children)
}

// vim: ts=4
