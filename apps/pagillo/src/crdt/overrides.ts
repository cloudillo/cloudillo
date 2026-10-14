// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Paragraph overrides (`po` line attr) from untrusted sources (clipboard, remote writers): known
 * keys with sane values only. Worker-safe.
 */

import { FX, type Marks, type ParagraphProps } from '@cloudillo/typeset'

import type { StoredTextFrameData } from './stored-types'

const MAX = 1000 * FX

const len = (min: number) => (v: unknown) =>
	typeof v === 'number' && Number.isFinite(v) && v >= min && v <= MAX
const int = (min: number, max: number) => (v: unknown) =>
	Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const oneOf =
	(...vs: string[]) =>
	(v: unknown) =>
		vs.includes(v as string)
const str = (v: unknown) => typeof v === 'string' && v.length <= 100
/** Colours reach SVG/PDF output: allow-list them (no `url(…)` or other functions). */
const color = (v: unknown) =>
	typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(v.trim())
const bool = (v: unknown) => typeof v === 'boolean'

/** `list` is absent on purpose: it is derived from the `list`/`indent` line attrs. */
const RULES: { [K in keyof ParagraphProps]?: (v: unknown) => boolean } = {
	size: len(FX),
	leading: len(0),
	spaceBefore: len(0),
	spaceAfter: len(0),
	indentStart: len(-MAX),
	indentEnd: len(-MAX),
	indentFirst: len(-MAX),
	align: oneOf('left', 'right', 'center', 'justify'),
	breakBefore: oneOf('none', 'column', 'page'),
	font: str,
	lang: str,
	hyphenate: bool,
	keepNext: bool,
	keepTogether: bool,
	spanColumns: bool,
	widows: int(0, 20),
	orphans: int(0, 20),
	dropCap: int(0, 10),
	tocLevel: int(1, 6)
}

export function sanitizeOverrides(po: unknown): Partial<ParagraphProps> | undefined {
	if (!po || typeof po !== 'object' || Array.isArray(po)) return
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(po)) {
		if (Object.hasOwn(RULES, k) && RULES[k as keyof ParagraphProps]?.(v)) out[k] = v
	}
	return Object.keys(out).length ? (out as Partial<ParagraphProps>) : undefined
}

const MARK_RULES: { [K in keyof Marks]-?: (v: unknown) => boolean } = {
	bold: bool,
	italic: bool,
	underline: bool,
	strike: bool,
	color,
	font: str,
	cs: str,
	link: (v) => typeof v === 'string',
	size: len(FX)
}

/** Inline marks (`Y.Text` attributes) from a peer: known keys with sane values only. */
export function sanitizeMarks(a: unknown): Marks {
	const out: Record<string, unknown> = {}
	if (!a || typeof a !== 'object') return out
	for (const [k, v] of Object.entries(a)) {
		if (Object.hasOwn(MARK_RULES, k) && MARK_RULES[k as keyof Marks](v)) out[k] = v
	}
	return out
}

type TextBox = Omit<StoredTextFrameData, 'story' | 'chain'>

const BOX_RULES: { [K in keyof TextBox]-?: (v: unknown) => boolean } = {
	inset: len(0),
	strokeW: len(0),
	fill: color,
	stroke: color
}

/** Text frame box styling from a peer: known keys with sane values only. */
export function sanitizeBox(d: unknown): TextBox {
	const out: Record<string, unknown> = {}
	if (!d || typeof d !== 'object') return out
	for (const [k, v] of Object.entries(d)) {
		if (Object.hasOwn(BOX_RULES, k) && BOX_RULES[k as keyof TextBox](v)) out[k] = v
	}
	return out
}

// vim: ts=4
