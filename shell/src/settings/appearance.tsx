// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Field, LoadingSpinner, Panel, RadioGroup, useApi } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuLayers as IcGlass,
	LuMonitor as IcSystem,
	LuMoon as IcDark,
	LuSquare as IcOpaque,
	LuSun as IcLight
} from 'react-icons/lu'

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

/**
 * The preference the pre-paint script already acted on, read back.
 *
 * The inline bootstrap in `index.html` — and its copy in the Rust site wrapper,
 * `crates/cloudillo-site/src/wrapper.rs` `PREPAINT` — reads these two keys before
 * first paint and puts the resulting classes on `<body>`. A boot path that then
 * calls `applyTheme(undefined, undefined)` does *not* reproduce that: `undefined`
 * means "follow the system", so a reader whose stored choice differs from their
 * system setting watches the page repaint into the other scheme.
 *
 * On a shell route `#initial-splash` hides that repaint. A published page has no
 * splash, which is where it became visible.
 *
 * Returns the raw stored strings, which is exactly what `applyTheme` takes; a
 * missing or unreadable key stays `undefined` and keeps the system-preference
 * behaviour the bootstrap script falls back to.
 */
export function readStoredTheme(): {
	theme: string | undefined
	colors: string | undefined
} {
	try {
		return {
			theme: localStorage.getItem('cloudillo.theme') ?? undefined,
			colors: localStorage.getItem('cloudillo.colors') ?? undefined
		}
	} catch {
		// localStorage may be unavailable (sandboxed contexts, etc.)
		return { theme: undefined, colors: undefined }
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

	// RadioGroup reports a value, onSettingChange reads a select-shaped event target
	function onThemeChange(name: 'ui.theme' | 'ui.colors', value: string) {
		if (!settings) return

		void onSettingChange({
			target: { name, value, type: 'select-one', tagName: 'SELECT' }
		} as unknown as React.ChangeEvent<HTMLSelectElement>)
		if (name === 'ui.theme') setTheme(value, settings['ui.colors'])
		else setTheme(settings['ui.theme'], value)
	}

	if (!settings) return <LoadingSpinner className="auto-bg" />

	return (
		<Panel>
			<Field label={t('Theme')}>
				<RadioGroup
					variant="card"
					orientation="horizontal"
					value={(settings['ui.theme'] as string) || 'glass'}
					onChange={(value) => onThemeChange('ui.theme', value)}
					options={[
						{ value: 'glass', label: t('Glass'), leading: <IcGlass /> },
						{ value: 'opaque', label: t('Opaque'), leading: <IcOpaque /> }
					]}
				/>
			</Field>
			<Field label={t('Colors')}>
				<RadioGroup
					variant="card"
					orientation="horizontal"
					value={(settings['ui.colors'] as string) || 'default'}
					onChange={(value) => onThemeChange('ui.colors', value)}
					options={[
						{
							value: 'default',
							label: t('Use browser settings'),
							leading: <IcSystem />
						},
						{ value: 'light', label: t('Light'), leading: <IcLight /> },
						{ value: 'dark', label: t('Dark'), leading: <IcDark /> }
					]}
				/>
			</Field>
		</Panel>
	)
}

// vim: ts=4
