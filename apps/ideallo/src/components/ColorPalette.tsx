// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Color palette component for stroke and fill color selection
 * Features:
 * - 3 rows: neutrals, normal colors, pastel colors
 * - Optional transparent swatch for fill
 * - Hex input for custom colors
 * - Returns palette keys (e.g., "red-p") for theme-aware storage
 */

import * as React from 'react'

import { colorToCss, PALETTE_KEYS } from '../utils/palette.js'

export interface ColorPaletteProps {
	value: string
	onChange: (color: string) => void
	showTransparent?: boolean
	/**
	 * Offer "None" but refuse it: clearing this paint would leave the object with neither a stroke
	 * nor a fill. Shown rather than hidden, so the option does not appear and disappear as the
	 * other paint changes.
	 */
	disableTransparent?: boolean
}

export function ColorPalette({
	value,
	onChange,
	showTransparent,
	disableTransparent
}: ColorPaletteProps) {
	const [hexInput, setHexInput] = React.useState('')

	// Update hex input when value changes (if it's a hex color)
	React.useEffect(() => {
		if (value?.startsWith('#')) {
			setHexInput(value.slice(1))
		} else {
			setHexInput('')
		}
	}, [value])

	const handleHexSubmit = React.useCallback(() => {
		if (/^[0-9a-fA-F]{6}$/.test(hexInput)) {
			onChange('#' + hexInput.toLowerCase())
		}
	}, [hexInput, onChange])

	const handleHexKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter') {
				handleHexSubmit()
			}
		},
		[handleHexSubmit]
	)

	const isTransparent = value === 'transparent' || value === 'none'

	return (
		<div className="ideallo-color-palette" onClick={(e) => e.stopPropagation()}>
			{/* Row 1: Optional transparent + neutrals */}
			<div className="palette-row">
				{showTransparent && (
					<button
						type="button"
						className={`palette-swatch transparent ${isTransparent ? 'selected' : ''}`}
						onClick={() => onChange('transparent')}
						disabled={disableTransparent}
						aria-disabled={disableTransparent}
						title={disableTransparent ? 'Keep at least a stroke or a fill' : 'None'}
					>
						<span className="swatch-none">⊘</span>
					</button>
				)}
				{PALETTE_KEYS.neutrals.map((key) => (
					<button
						key={key}
						type="button"
						className={`palette-swatch ${value === key ? 'selected' : ''}`}
						style={{ background: colorToCss(key) }}
						onClick={() => onChange(key)}
						title={key}
					/>
				))}
			</div>

			{/* Row 2: Normal colors */}
			<div className="palette-row">
				{PALETTE_KEYS.normal.map((key) => (
					<button
						key={key}
						type="button"
						className={`palette-swatch ${value === key ? 'selected' : ''}`}
						style={{ background: colorToCss(key) }}
						onClick={() => onChange(key)}
						title={key}
					/>
				))}
			</div>

			{/* Row 3: Pastel colors */}
			<div className="palette-row">
				{PALETTE_KEYS.pastel.map((key) => (
					<button
						key={key}
						type="button"
						className={`palette-swatch ${value === key ? 'selected' : ''}`}
						style={{ background: colorToCss(key) }}
						onClick={() => onChange(key)}
						title={key}
					/>
				))}
			</div>

			{/*
				Custom hex input. It stays a real `<input>`: `isEditableTarget` gates on the tag, so
				anything else here would let `r` typed into the field arm the rect tool instead.
				The `#` beside it is decoration, not a label, hence the explicit aria-label.
			*/}
			<div className="palette-hex">
				<span>#</span>
				<input
					type="text"
					value={hexInput}
					onChange={(e) => setHexInput(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
					onBlur={handleHexSubmit}
					onKeyDown={handleHexKeyDown}
					placeholder="000000"
					maxLength={6}
					aria-label="Hex colour"
				/>
			</div>
		</div>
	)
}

// vim: ts=4
