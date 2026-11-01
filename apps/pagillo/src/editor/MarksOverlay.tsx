// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hidden-character marks of one page (`pageMarks`): an SVG over the page box (viewBox in pt,
 * like `SpellOverlay`). Editor-only, never in thumbnails or export.
 */

import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcAnchor } from '../icons'
import type { Mark, MarkKind } from './marks'

export interface MarksOverlayProps {
	/** Page size, Fx. */
	w: number
	h: number
	marks: Mark[]
}

const pt = (fx: number) => fx / FX
const COL = 'var(--col-primary)'

const GLYPH: Partial<Record<MarkKind, string>> = {
	space: '·',
	nbsp: '°',
	ideo: '□',
	tab: '→',
	shy: '¬',
	lbr: '↵',
	para: '¶',
	end: '#'
}
const CENTRED = new Set<MarkKind>(['space', 'nbsp', 'ideo', 'tab', 'shy'])

/**
 * The text-anchor glyph, `size` square with its top-left at `x`, `y` (the caller's units): the
 * selected frame's anchor handle (`FrameOverlay`) and the hidden-characters anchor marks.
 * `unused` = a marker that anchors nothing: faded and struck through.
 */
export function AnchorGlyph({
	x = 0,
	y = 0,
	size,
	color,
	unused
}: {
	x?: number
	y?: number
	size: number
	color: string
	unused?: boolean
}) {
	return (
		<>
			<IcAnchor x={x} y={y} size={size} color={color} opacity={unused ? 0.4 : undefined} />
			{unused && (
				<line
					x1={x}
					y1={y + size}
					x2={x + size}
					y2={y}
					stroke={color}
					strokeWidth={size / 10}
				/>
			)}
		</>
	)
}

function markEl(m: Mark, i: number, t: ReturnType<typeof useTranslation>['t']) {
	const key = `${i}:${m.k}`
	switch (m.k) {
		case 'field':
		case 'fn':
			return (
				<rect
					key={key}
					x={m.x}
					y={m.y}
					width={Math.max(0, (m.x2 ?? m.x) - m.x)}
					height={m.size}
					transform={m.rot}
					fill={COL}
					opacity={0.12}
				/>
			)
		case 'zw':
			return (
				<line
					key={key}
					x1={m.x}
					y1={m.y}
					x2={m.x}
					y2={m.y - 0.75 * m.size}
					transform={m.rot}
					stroke={COL}
					strokeWidth={0.75}
					opacity={0.7}
				/>
			)
		case 'page':
		case 'column':
		case 'section':
			return (
				<g key={key} transform={m.rot} opacity={0.7}>
					<line
						x1={m.x}
						y1={m.y}
						x2={m.x2 ?? m.x}
						y2={m.y}
						stroke={COL}
						strokeWidth={0.75}
						strokeDasharray="2 2"
					/>
					{m.label && (
						<text
							x={m.x + 2}
							y={m.y - 1}
							fontSize={0.6 * m.size}
							fill={COL}
							fontFamily="system-ui, sans-serif"
						>
							{t(m.label)}
						</text>
					)}
				</g>
			)
		case 'frame':
		case 'frame-unused':
			// Zero-width marker: the glyph centred on it, standing on the baseline.
			return (
				<g key={key} transform={m.rot} opacity={0.7}>
					{m.label && <title>{t(m.label)}</title>}
					<AnchorGlyph
						x={m.x - m.size / 2}
						y={m.y - m.size}
						size={m.size}
						color={COL}
						unused={m.k === 'frame-unused'}
					/>
				</g>
			)
		default:
			return (
				<text
					key={key}
					x={m.x}
					y={m.y}
					transform={m.rot}
					fontSize={m.size}
					textAnchor={CENTRED.has(m.k) ? 'middle' : 'start'}
					fill={COL}
					opacity={0.7}
				>
					{GLYPH[m.k]}
				</text>
			)
	}
}

export function MarksOverlay({ w, h, marks }: MarksOverlayProps) {
	const { t } = useTranslation()
	if (!marks.length) return null
	return (
		<svg
			className="pagillo-marks"
			viewBox={`0 0 ${pt(w)} ${pt(h)}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			fontFamily="system-ui, sans-serif"
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none'
			}}
		>
			{marks.map((m, i) => markEl(m, i, t))}
		</svg>
	)
}

// vim: ts=4
