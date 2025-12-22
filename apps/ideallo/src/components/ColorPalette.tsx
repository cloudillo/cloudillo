// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Color palette component for stroke and fill color selection
 * Features:
 * - 3 rows: neutrals, normal colors, pastel colors
 * - Optional transparent swatch for fill
 * - Hex input for custom colors
 * - Returns palette keys (e.g., "red-p") for theme-aware storage
 */

import * as React from 'react'
import { PALETTE_KEYS, colorToCss } from '../utils/palette.js'

export interface ColorPaletteProps {
	value: string
	onChange: (color: string) => void
	showTransparent?: boolean
}

export function ColorPalette({ value, onChange, showTransparent }: ColorPaletteProps) {
	const [hexInput, setHexInput] = React.useState('')

	// Update hex input when value changes (if it's a hex color)
	React.useEffect(() => {
		if (value && value.startsWith('#')) {
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
						title="None"
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

			{/* Custom hex input */}
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
				/>
			</div>
		</div>
	)
}

// vim: ts=4
