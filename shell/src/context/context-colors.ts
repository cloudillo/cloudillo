// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Per-context frame colors. A swatch is a hue + chroma (ui/app-shell.css); lightness is
 * shared per mode. Stored as `ui.context_colors`: context key → swatch key.
 */

export const CONTEXT_COLORS = [
	'neutral',
	'blue',
	'violet',
	'accent',
	'rose',
	'amber',
	'sand',
	'green',
	'teal'
] as const
export type ContextColor = (typeof CONTEXT_COLORS)[number]

/** Picker labels (i18n keys) */
export const CONTEXT_COLOR_LABELS: Record<ContextColor, string> = {
	neutral: 'Neutral',
	blue: 'Blue',
	violet: 'Violet',
	accent: 'Magenta',
	rose: 'Rose',
	amber: 'Amber',
	sand: 'Sand',
	green: 'Green',
	teal: 'Teal'
}

export function isContextColor(v: unknown): v is ContextColor {
	return (CONTEXT_COLORS as readonly unknown[]).includes(v)
}

/** The swatch to paint for a context key, or undefined for the default tint. Home (no entry) → 'neutral'. */
export function resolveContextColor(
	colors: Record<string, string>,
	key: string | undefined,
	isHome: boolean
): ContextColor | undefined {
	const color = key ? colors[key] : undefined
	if (isContextColor(color)) return color
	return isHome ? 'neutral' : undefined
}

// vim: ts=4
