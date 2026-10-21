// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Length field: `NumberInput` in text mode, showing the per-user display unit.
 * Typed units (mm/cm/in/pt) and `+ − × ÷` arithmetic are parsed on commit (no `eval`);
 * the stored value is always Fx.
 */

import { NumberInput } from '@cloudillo/react'
import { type Fx, fxToPt, ptToFx } from '@cloudillo/typeset'
import * as React from 'react'

export type LengthUnit = 'mm' | 'cm' | 'in' | 'pt'
export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'in', 'pt']

/** Points per unit. */
const PT: Record<LengthUnit, number> = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1 }

const STORAGE_KEY = 'pagillo.lengthUnit'

function initialUnit(): LengthUnit {
	try {
		const u = localStorage.getItem(STORAGE_KEY) as LengthUnit | null
		if (u && u in PT) return u
	} catch {
		// storage blocked: fall through to the locale default
	}
	return navigator.language === 'en-US' ? 'in' : 'mm'
}

let unit: LengthUnit | undefined
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
	listeners.add(cb)
	return () => {
		listeners.delete(cb)
	}
}

function getUnit(): LengthUnit {
	unit ??= initialUnit()
	return unit
}

function setUnit(u: LengthUnit) {
	unit = u
	try {
		localStorage.setItem(STORAGE_KEY, u)
	} catch {
		// not persisted; still applies for this session
	}
	for (const l of listeners) l()
}

/** The display unit, shared by every length field of this tab. */
export function useLengthUnit(): [LengthUnit, (u: LengthUnit) => void] {
	return [React.useSyncExternalStore(subscribe, getUnit), setUnit]
}

const ALIASES: Record<string, string> = { '−': '-', '×': '*', '÷': '/' }
const TOKEN = /\s*(?:(\d+(?:[.,]\d*)?|[.,]\d+)\s*(mm|cm|in|pt|")?|([-+−×*÷/]))/y

/**
 * Parse `text` to points. Grammar: `term (± term)*`, `term = [-] number [unit] ([×÷] number)*`.
 * A number without a unit is in `dflt`; multipliers and divisors are plain numbers.
 */
export function parseLength(text: string, dflt: LengthUnit): number | undefined {
	const toks: { n?: number; u?: string; op?: string }[] = []
	TOKEN.lastIndex = 0
	while (TOKEN.lastIndex < text.length) {
		if (!text.slice(TOKEN.lastIndex).trim()) break
		const m = TOKEN.exec(text)
		if (!m) return undefined
		if (m[1] !== undefined) toks.push({ n: Number(m[1].replace(',', '.')), u: m[2] })
		else toks.push({ op: ALIASES[m[3]] ?? m[3] })
	}
	let i = 0
	const length = (): number | undefined => {
		let sign = 1
		while (toks[i]?.op === '-' || toks[i]?.op === '+') if (toks[i++].op === '-') sign = -sign
		const t = toks[i++]
		if (t?.n === undefined) return undefined
		const u: LengthUnit = t.u === '"' ? 'in' : ((t.u as LengthUnit | undefined) ?? dflt)
		let v = sign * t.n * PT[u]
		while (toks[i]?.op === '*' || toks[i]?.op === '/') {
			const op = toks[i++].op
			const f = toks[i++]
			if (f?.n === undefined || f.u || (op === '/' && f.n === 0)) return undefined
			v = op === '*' ? v * f.n : v / f.n
		}
		return v
	}
	let total = length()
	while (total !== undefined && i < toks.length) {
		const op = toks[i++].op
		if (op !== '+' && op !== '-') return undefined
		const v = length()
		total = v === undefined ? undefined : op === '+' ? total + v : total - v
	}
	return total
}

export interface LengthInputProps {
	value?: Fx
	onChange(value: Fx): void
	/** Force a unit (font sizes and leading are always pt). */
	unit?: LengthUnit
	min?: Fx
	max?: Fx
	size?: 'sm' | 'md' | 'lg'
	className?: string
	'aria-label'?: string
}

export function LengthInput({
	value,
	onChange,
	unit: forced,
	min,
	max,
	...props
}: LengthInputProps) {
	const [display] = useLengthUnit()
	const u = forced ?? display
	const k = PT[u]
	const toUnit = (fx: Fx) => fxToPt(fx) / k
	return (
		<NumberInput
			{...props}
			value={value === undefined ? undefined : toUnit(value)}
			min={min === undefined ? undefined : toUnit(min)}
			max={max === undefined ? undefined : toUnit(max)}
			step={u === 'mm' || u === 'pt' ? 1 : 0.1}
			suffix={u}
			parse={(text) => {
				const pt = parseLength(text, u)
				return pt === undefined ? undefined : pt / k
			}}
			format={(n) => String(Number(n.toFixed(u === 'in' ? 3 : 2)))}
			onChange={(n) => onChange(ptToFx(n * k))}
		/>
	)
}

// vim: ts=4
