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
 * ThemePicker - Select and apply preset themes/palettes
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { YPrezilloDocument, Palette, PalettePreset } from '../../crdt'
import { PALETTE_PRESETS, getPalette, applyPreset } from '../../crdt'
import './ThemePicker.css'

export interface ThemePickerProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	currentPalette: Palette
}

/**
 * Get the 6 accent colors from a palette for preview
 */
function getAccentColors(palette: Palette): string[] {
	return [
		palette.accent1?.color ?? '#cccccc',
		palette.accent2?.color ?? '#cccccc',
		palette.accent3?.color ?? '#cccccc',
		palette.accent4?.color ?? '#cccccc',
		palette.accent5?.color ?? '#cccccc',
		palette.accent6?.color ?? '#cccccc'
	]
}

/**
 * Check if current palette matches a preset (by comparing colors)
 */
function isPaletteMatchingPreset(current: Palette, preset: PalettePreset): boolean {
	const presetPalette = preset.palette
	// Compare a few key colors
	return (
		current.background?.color === presetPalette.background?.color &&
		current.text?.color === presetPalette.text?.color &&
		current.accent1?.color === presetPalette.accent1?.color &&
		current.accent2?.color === presetPalette.accent2?.color
	)
}

export function ThemePicker({ doc, yDoc, currentPalette }: ThemePickerProps) {
	const scrollRef = React.useRef<HTMLDivElement>(null)

	// Find which preset matches current palette (if any)
	const activePresetId = React.useMemo(() => {
		for (const preset of PALETTE_PRESETS) {
			if (isPaletteMatchingPreset(currentPalette, preset)) {
				return preset.id
			}
		}
		return null
	}, [currentPalette])

	const handlePresetClick = (preset: PalettePreset) => {
		applyPreset(yDoc, doc, preset)
	}

	return (
		<div className="c-theme-picker">
			<div className="c-theme-picker-scroll" ref={scrollRef}>
				{PALETTE_PRESETS.map((preset) => {
					const isActive = preset.id === activePresetId
					const accents = getAccentColors(preset.palette)
					const bgColor = preset.palette.background?.color ?? '#ffffff'

					return (
						<button
							key={preset.id}
							className={`c-theme-picker-card ${isActive ? 'c-theme-picker-card--active' : ''}`}
							onClick={() => handlePresetClick(preset)}
							title={preset.name}
						>
							{/* Preview area with gradient accent bar */}
							<div
								className="c-theme-picker-preview"
								style={{ backgroundColor: bgColor }}
							>
								<div
									className="c-theme-picker-accent-bar"
									style={{
										background: `linear-gradient(to right, ${accents[0]}, ${accents[1]}, ${accents[2]})`
									}}
								/>
							</div>

							{/* Accent dot row */}
							<div className="c-theme-picker-dots">
								{accents.map((color, i) => (
									<span
										key={i}
										className="c-theme-picker-dot"
										style={{ backgroundColor: color }}
									/>
								))}
							</div>

							{/* Name */}
							<span className="c-theme-picker-name">{preset.name}</span>

							{/* Active indicator */}
							{isActive && <span className="c-theme-picker-check">✓</span>}
						</button>
					)
				})}
			</div>
		</div>
	)
}

// vim: ts=4
