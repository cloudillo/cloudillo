// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Shared stored-code → runtime-value vocabularies for the canvas apps
 * (prezillo, ideallo). Each app's `type-converters` aliases these onto its
 * own branded types — the code vocabulary itself lives here once so a
 * format change cannot silently diverge between the two apps.
 */

/** Arrowhead shape codes (`N`/`A`/`T`/`C`/`D`/`B`). */
export const ARROW_TYPE_CODE = {
	N: 'none',
	A: 'arrow',
	T: 'triangle',
	C: 'circle',
	D: 'diamond',
	B: 'bar'
} as const

/** Connector routing codes (`S`/`O`/`C`). */
export const ROUTING_CODE = {
	S: 'straight',
	O: 'orthogonal',
	C: 'curved'
} as const

/** Anchor point codes (named points + `a` for auto). */
export const ANCHOR_CODE = {
	c: 'center',
	t: 'top',
	b: 'bottom',
	l: 'left',
	r: 'right',
	tl: 'top-left',
	tr: 'top-right',
	bl: 'bottom-left',
	br: 'bottom-right',
	a: 'auto'
} as const

/** Text horizontal alignment codes (`l`/`c`/`r`/`j`). */
export const TEXT_ALIGN_CODE = {
	l: 'left',
	c: 'center',
	r: 'right',
	j: 'justify'
} as const

/** Text vertical alignment codes (`t`/`m`/`b`). */
export const VERT_ALIGN_CODE = {
	t: 'top',
	m: 'middle',
	b: 'bottom'
} as const

// vim: ts=4
