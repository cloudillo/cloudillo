// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { getAppBus } from '@cloudillo/core'
import i18n from 'i18next'
import * as React from 'react'
import { initReactI18next, Trans, useTranslation } from 'react-i18next'

import libHu from './i18n/hu/translation.json'

/** Scanned-but-untranslated keys are "": dropping them falls back to the lib bundle, then English */
const nonEmpty = (bundle: Record<string, string>) =>
	Object.fromEntries(Object.entries(bundle).filter(([, v]) => v))

/**
 * Init the app's i18next instance: English keys, Hungarian resources, Cloudillo separators.
 * The library's own bundle is merged under the app's, so non-empty app entries win.
 */
export function initAppI18n(hu: Record<string, string>): typeof i18n {
	i18n.use(initReactI18next)
		.init({
			resources: {
				en: { translation: {} },
				hu: { translation: { ...libHu, ...nonEmpty(hu) } }
			},
			fallbackLng: 'en',
			keySeparator: '@',
			nsSeparator: '$',
			interpolation: { escapeValue: false }
		})
		.catch((err) => console.error('[i18n] init failed', err))
	// Live switch from the shell; the initial language is applied by each app after bus init
	getAppBus().onLanguageChange((lng) => {
		void i18n.changeLanguage(lng)
	})
	return i18n
}

/** Marks a string for l-scan; translate it later with t() */
export const N_ = (key: string): string => key

export type TFunction = (key: string, options?: Record<string, unknown>) => string

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
