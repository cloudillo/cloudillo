// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LoadingSpinner, useApi } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { getShellBus } from '../message-bus/index.js'
import { useSettings } from './settings.js'

// Track current color scheme listener so we can remove it when settings change
let colorSchemeCleanup: (() => void) | null = null

function applyColorScheme(dark: boolean) {
	if (dark) {
		document.body.classList.remove('light')
		document.body.classList.add('dark')
	} else {
		document.body.classList.remove('dark')
		document.body.classList.add('light')
	}
	getShellBus()?.broadcastThemeUpdate(dark)
}

function applySystemColorScheme() {
	const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
	applyColorScheme(dark)
}

// Apply theme + color scheme to the document body. Pure DOM side-effect — does
// not touch localStorage. Use this on paths where the persisted user preference
// should be preserved (guest-mode fallback, error fallback).
export function applyTheme(
	theme: string | number | boolean | undefined,
	colors: string | number | boolean | undefined
) {
	switch (theme) {
		case 'glass':
			document.body.classList.remove('theme-opaque')
			document.body.classList.add('theme-glass')
			break
		case 'opaque':
			document.body.classList.remove('theme-glass')
			document.body.classList.add('theme-opaque')
			break
		default:
			document.body.classList.remove('theme-opaque')
			document.body.classList.add('theme-glass')
			break
	}

	// Remove previous system color scheme listener
	if (colorSchemeCleanup) {
		colorSchemeCleanup()
		colorSchemeCleanup = null
	}

	switch (colors) {
		case 'dark':
			applyColorScheme(true)
			break
		case 'light':
			applyColorScheme(false)
			break
		default:
			// Apply current system preference and listen for changes
			applySystemColorScheme()
			if (window.matchMedia) {
				const mql = window.matchMedia('(prefers-color-scheme: dark)')
				const handler = () => applySystemColorScheme()
				mql.addEventListener('change', handler)
				colorSchemeCleanup = () => mql.removeEventListener('change', handler)
			}
			break
	}
}

// Persist the user's theme/colors choice to localStorage so the pre-paint
// bootstrap script in index.html can replay the right body classes on next
// load (no theme/colors FOUC). Only known values are written; anything else
// removes the key so the bootstrap script re-runs its system-detection logic.
export function persistTheme(
	theme: string | number | boolean | undefined,
	colors: string | number | boolean | undefined
) {
	try {
		if (theme === 'opaque' || theme === 'glass') {
			localStorage.setItem('cloudillo.theme', theme)
		} else {
			localStorage.removeItem('cloudillo.theme')
		}
		if (colors === 'dark' || colors === 'light') {
			localStorage.setItem('cloudillo.colors', colors)
		} else {
			localStorage.removeItem('cloudillo.colors')
		}
	} catch {
		// localStorage may be unavailable (sandboxed contexts, etc.)
	}
}

// Ergonomic shortcut for the common "apply + persist" case (e.g. settings
// form changes). Paths that should NOT overwrite the user's stored preference
// (guest-mode, error fallback) should call `applyTheme` directly.
export function setTheme(
	theme: string | number | boolean | undefined,
	colors: string | number | boolean | undefined
) {
	applyTheme(theme, colors)
	persistTheme(theme, colors)
}

export function AppearanceSettings() {
	const { t } = useTranslation()
	useApi()

	const { settings, onSettingChange } = useSettings('ui')

	function onThemeChange(evt: React.ChangeEvent<HTMLSelectElement>) {
		if (!settings) return

		onSettingChange(evt)
		//console.log('onThemeChange', evt.target.name, evt.target.value)
		if (evt.target.name == 'ui.theme') setTheme(evt.target.value, settings['ui.colors'])
		if (evt.target.name == 'ui.colors') setTheme(settings['ui.theme'], evt.target.value)
	}

	if (!settings) return <LoadingSpinner />

	return (
		<div className="c-panel">
			<label className="c-settings-field">
				<span>{t('Theme')}</span>
				<select
					className="c-select"
					name="ui.theme"
					value={settings['ui.theme'] as string}
					onChange={onThemeChange}
				>
					<option value="glass">{t('Glass')}</option>
					<option value="opaque">{t('Opaque')}</option>
				</select>
			</label>
			<label className="c-settings-field">
				<span>{t('Colors')}</span>
				<select
					className="c-select"
					name="ui.colors"
					value={settings['ui.colors'] as string}
					onChange={onThemeChange}
				>
					<option value="default">{t('Use browser settings')}</option>
					<option value="light">{t('Light')}</option>
					<option value="dark">{t('Dark')}</option>
				</select>
			</label>
		</div>
	)
}

// vim: ts=4
