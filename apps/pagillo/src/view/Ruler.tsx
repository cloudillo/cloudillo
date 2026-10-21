// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** Contextual page rulers with the paragraph indent markers on the top ruler. */

import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export interface IndentPatch {
	indentStart?: number
	indentEnd?: number
	indentFirst?: number
}

/** Indent markers over one column of the page (all Fx). */
export interface RulerIndents {
	/** Column left edge and width, page Fx. */
	x: number
	w: number
	/** Effective indents (`first` is relative to `start`). */
	start: number
	end: number
	first: number
	onChange(patch: IndentPatch): void
}

type Marker = 'start' | 'first' | 'end'

const snap = (v: number) => Math.round(v / FX) * FX

/**
 * Start and first-line indent on the left, end indent on the right, over the column box. Drag
 * or arrow keys (1 pt, Shift 10 pt); the value is committed on release.
 */
function IndentMarkers({
	x,
	w: width,
	start,
	end,
	first,
	onChange,
	px
}: RulerIndents & { px: number }) {
	const { t } = useTranslation()
	const bar = React.useRef<HTMLDivElement>(null)
	const [drag, setDrag] = React.useState<{ m: Marker; v: number }>()
	const val = (m: Marker) => (drag?.m === m ? drag.v : { start, first, end }[m])

	/** Marker x, Fx from the column's left edge. */
	const pos = (m: Marker) =>
		m === 'start'
			? val('start')
			: m === 'first'
				? val('start') + val('first')
				: width - val('end')
	const fromPos = (m: Marker, c0: number) => {
		const c = Math.max(0, Math.min(width, c0))
		return snap(m === 'start' ? c : m === 'first' ? c - start : width - c)
	}
	const commit = (m: Marker, v: number) =>
		onChange(
			m === 'start'
				? { indentStart: v }
				: m === 'first'
					? { indentFirst: v }
					: { indentEnd: v }
		)
	const xAt = (e: React.PointerEvent) => {
		const r = bar.current?.getBoundingClientRect()
		return r?.width ? ((e.clientX - r.left) / r.width) * width : 0
	}

	const marker = (m: Marker, label: string, glyph: string) => (
		<div
			key={m}
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuemin={m === 'first' ? -width : 0}
			aria-valuemax={width}
			aria-valuenow={Math.round(val(m) / FX)}
			aria-valuetext={`${Math.round(val(m) / FX)} pt`}
			title={label}
			style={{
				position: 'absolute',
				left: `${(pos(m) / width) * 100}%`,
				[m === 'first' ? 'top' : 'bottom']: 0,
				transform: 'translateX(-50%)',
				cursor: 'ew-resize',
				lineHeight: 1,
				fontSize: 9,
				color: 'var(--col-primary)',
				pointerEvents: 'auto',
				touchAction: 'none'
			}}
			onPointerDown={(e) => {
				// Not a page click: no caret placement or deselect underneath.
				e.stopPropagation()
				e.preventDefault()
				e.currentTarget.setPointerCapture(e.pointerId)
				setDrag({ m, v: val(m) })
			}}
			onPointerMove={(e) => {
				e.stopPropagation()
				if (drag?.m === m) setDrag({ m, v: fromPos(m, xAt(e)) })
			}}
			onPointerUp={(e) => {
				e.stopPropagation()
				if (drag?.m === m && drag.v !== { start, first, end }[m]) commit(m, drag.v)
				setDrag(undefined)
			}}
			onKeyDown={(e) => {
				if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
				e.preventDefault()
				e.stopPropagation()
				const step = (e.shiftKey ? 10 : 1) * FX * (e.key === 'ArrowLeft' ? -1 : 1)
				// The end marker sits on the right: moving it right shrinks the indent.
				commit(m, snap(val(m) + (m === 'end' ? -step : step)))
			}}
		>
			{glyph}
		</div>
	)

	return (
		<div
			ref={bar}
			className="pagillo-ruler-indents"
			style={{
				position: 'absolute',
				left: (x / FX) * px,
				width: (width / FX) * px,
				top: -RULER_PX,
				height: RULER_PX,
				pointerEvents: 'none'
			}}
		>
			{marker('first', t('First line indent'), '▼')}
			{marker('start', t('Indent start'), '▲')}
			{marker('end', t('Indent end'), '▲')}
		</div>
	)
}

const RULER_PX = 16

/**
 * Contextual page rulers: along the top and left page edges, ticks every 36 pt (long
 * every 72 pt); `hi` (Fx) highlights the selected box's extent. Shown in Edit layout and while a
 * frame is selected or dragged, or pinned by the View toggle. With `indents` the top ruler also
 * carries the caret paragraph's indent markers over its column.
 */
export function PageRulers({
	w,
	h,
	scale,
	hi,
	indents
}: {
	/** Page size, Fx. */
	w: number
	h: number
	/** CSS px per pt. */
	scale: number
	hi?: { x: number; y: number; w: number; h: number }
	indents?: RulerIndents
}) {
	const S = RULER_PX
	const px = (v: number) => (v / FX) * scale
	const bar = (horiz: boolean) => {
		const ticks: number[] = []
		for (let v = 0; v <= (horiz ? w : h); v += 36 * FX) ticks.push(v)
		return (
			<svg
				aria-hidden="true"
				style={{
					position: 'absolute',
					left: horiz ? 0 : -S,
					top: horiz ? -S : 0,
					width: horiz ? '100%' : S,
					height: horiz ? S : '100%',
					background: 'var(--col-container)',
					pointerEvents: 'none'
				}}
			>
				{hi && (
					<rect
						x={horiz ? px(hi.x) : 0}
						y={horiz ? 0 : px(hi.y)}
						width={horiz ? px(hi.w) : S}
						height={horiz ? S : px(hi.h)}
						fill="var(--col-primary)"
						opacity={0.25}
					/>
				)}
				{ticks.map((v) => {
					const p = px(v)
					const k = v % (72 * FX) === 0 ? 4 : 10
					return horiz ? (
						<line
							key={v}
							x1={p}
							x2={p}
							y1={k}
							y2={S}
							stroke="currentColor"
							opacity={0.5}
						/>
					) : (
						<line
							key={v}
							y1={p}
							y2={p}
							x1={k}
							x2={S}
							stroke="currentColor"
							opacity={0.5}
						/>
					)
				})}
			</svg>
		)
	}
	return (
		<>
			{bar(true)}
			{bar(false)}
			{indents && indents.w > 0 && <IndentMarkers {...indents} px={scale} />}
		</>
	)
}

// vim: ts=4
