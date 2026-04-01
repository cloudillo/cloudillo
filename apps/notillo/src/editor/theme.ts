// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// OpalUI-compatible BlockNote theme overrides.
// BlockNote's Mantine theme uses CSS variables we can override
// to match OpalUI's color scheme.

export const notilloThemeOverrides = {
	// These CSS custom properties can be applied to the editor container
	// to integrate with OpalUI's design system.
	'--bn-colors-editor-text': 'var(--col-on-container)',
	'--bn-colors-editor-background': 'var(--col-container)',
	'--bn-colors-menu-text': 'var(--col-on-container)',
	'--bn-colors-menu-background': 'var(--col-container-high)',
	'--bn-colors-tooltip-text': 'var(--col-on-primary)',
	'--bn-colors-tooltip-background': 'var(--col-primary)',
	'--bn-colors-hovered-text': 'var(--col-on-container)',
	'--bn-colors-hovered-background': 'var(--col-container-high)',
	'--bn-colors-selected-text': 'var(--col-on-primary)',
	'--bn-colors-selected-background': 'var(--col-primary)',
	'--bn-colors-disabled-text': 'var(--col-on-surface)',
	'--bn-colors-disabled-background': 'var(--col-container-low)',
	'--bn-colors-shadow': 'var(--shadow-sm)',
	'--bn-colors-border': 'var(--col-outline)',
	'--bn-colors-side-menu': 'var(--col-on-surface)',
	'--bn-font-family': 'inherit'
} as const

// vim: ts=4
