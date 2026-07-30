// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Text style constants for the property bar and the text-bearing renderers.
 *
 * The stored-code maps (l/c/r/j, t/m/b) deliberately do NOT live here - they are in
 * crdt/type-converters.ts with every other code space this app translates. What is here is what
 * the UI and the renderers need: the size ladder and the per-type defaults.
 */

import type { VerticalAlign } from '../crdt/runtime-types.js'

/**
 * Sizes offered by the property bar's Size control.
 * Mirrors apps/prezillo/src/utils/text-styles.ts verbatim, so the two canvas apps offer the same
 * ladder and a document moving between them lands on a size the other one can also pick.
 */
export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96] as const

/**
 * Font size a freshly created object of each type gets, and the fallback a stored object with no
 * `fz` renders at.
 *
 * One per type, and the only two in the app: 16 for a text label, 18 for a sticky. Every creation
 * site and every renderer resolves its default here.
 */
export const DEFAULT_TEXT_FONT_SIZE = 16
export const DEFAULT_STICKY_FONT_SIZE = 18

/** Vertical alignment as CSS `align-items`, for the HTML fallback paths */
export const VERTICAL_ALIGN_CSS: Record<VerticalAlign, string> = {
	top: 'flex-start',
	middle: 'center',
	bottom: 'flex-end'
}

// vim: ts=4
