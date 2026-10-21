// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import './context-strip.css'
import {
	CONTEXT_COLOR_LABELS,
	CONTEXT_COLORS,
	type ContextColor
} from '../context/context-colors.js'

const OPTIONS = [undefined, ...CONTEXT_COLORS]

export interface ContextColorPickerProps {
	/** The stored swatch; undefined = the default tint */
	value: ContextColor | undefined
	onChange: (color: ContextColor | undefined) => void
	/** Leave out "Default" (home, whose default is a palette swatch) */
	noDefault?: boolean
}

/** A swatch row for the chip menu: "Default" first, then the palette. Stays open on pick, so the frame previews live. */
export function ContextColorPicker({ value, onChange, noDefault }: ContextColorPickerProps) {
	const { t } = useTranslation()
	const options = noDefault ? CONTEXT_COLORS : OPTIONS

	// Left/Right rove between the radios; Up/Down stay with the surrounding menu.
	function handleKeyDown(evt: React.KeyboardEvent<HTMLDivElement>) {
		const delta = evt.key === 'ArrowRight' ? 1 : evt.key === 'ArrowLeft' ? -1 : 0
		if (!delta) return
		evt.preventDefault()
		evt.stopPropagation()
		const radios = Array.from(evt.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
		const from = radios.indexOf(document.activeElement as HTMLElement)
		radios[(from + delta + radios.length) % radios.length]?.focus()
	}

	return (
		<div
			role="radiogroup"
			aria-label={t('Color')}
			className="c-ctx-colors"
			onKeyDown={handleKeyDown}
		>
			{options.map((color) => {
				const label = t(color ? CONTEXT_COLOR_LABELS[color] : 'Default')
				const checked = color === value
				return (
					<button
						key={color ?? 'default'}
						type="button"
						role="radio"
						aria-checked={checked}
						aria-label={label}
						title={label}
						tabIndex={checked ? 0 : -1}
						className="c-ctx-swatch"
						data-ctx-color={color}
						onClick={() => onChange(color)}
					/>
				)
			})}
		</div>
	)
}

// vim: ts=4
