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
 * PaletteSwatchGrid - Grid of clickable palette color/gradient swatches
 */

import * as React from 'react'
import { gradientToCSS } from '@cloudillo/canvas-tools'

import type {
	Palette,
	PaletteSlotName,
	PaletteColorSlotName,
	PaletteGradientSlotName
} from '../../crdt'
import {
	getColorSlotNames,
	getGradientSlotNames,
	getPaletteSlotDisplayName,
	isGradientSlot,
	getContrastColor
} from '../../crdt'

import './PaletteSwatchGrid.css'

export interface PaletteSwatchGridProps {
	palette: Palette
	/** Currently selected slot (if any) */
	selectedSlot?: PaletteSlotName | null
	/** Called when a slot is clicked */
	onSelect: (slot: PaletteSlotName) => void
	/** Show slot labels on hover */
	showLabels?: boolean
	/** Size of swatches */
	size?: 'sm' | 'md' | 'lg'
	/** Show gradient swatches */
	showGradients?: boolean
	/** Show transparent/none option */
	showTransparent?: boolean
	/** Whether transparent is currently selected */
	isTransparentSelected?: boolean
	/** Called when transparent is clicked */
	onTransparentSelect?: () => void
	/** Class name for the container */
	className?: string
}

/**
 * Grid of clickable palette swatches for selecting theme colors/gradients
 */
export function PaletteSwatchGrid({
	palette,
	selectedSlot,
	onSelect,
	showLabels = true,
	size = 'md',
	showGradients = false,
	showTransparent = false,
	isTransparentSelected = false,
	onTransparentSelect,
	className = ''
}: PaletteSwatchGridProps) {
	const colorSlots = getColorSlotNames()
	const gradientSlots = getGradientSlotNames()

	// Get the background style for a slot
	const getSlotStyle = (slot: PaletteSlotName): React.CSSProperties => {
		if (isGradientSlot(slot)) {
			const gradient = palette[slot as PaletteGradientSlotName]
			if (gradient) {
				return { background: gradientToCSS(gradient) }
			}
			return { background: '#cccccc' }
		} else {
			const color = palette[slot as PaletteColorSlotName]
			return { backgroundColor: color?.color ?? '#cccccc' }
		}
	}

	// Get the check mark color for a slot (for contrast)
	const getCheckColor = (slot: PaletteSlotName): string => {
		if (isGradientSlot(slot)) {
			// For gradients, use first stop color
			const gradient = palette[slot as PaletteGradientSlotName]
			const firstStop = gradient?.stops?.[0]
			return firstStop ? getContrastColor(firstStop.color) : '#ffffff'
		}
		const color = palette[slot as PaletteColorSlotName]
		return color ? getContrastColor(color.color) : '#ffffff'
	}

	const handleKeyDown = (
		e: React.KeyboardEvent,
		slot: PaletteSlotName,
		slots: PaletteSlotName[]
	) => {
		const currentIndex = slots.indexOf(slot)
		let newIndex = currentIndex

		switch (e.key) {
			case 'ArrowRight':
				newIndex = Math.min(currentIndex + 1, slots.length - 1)
				break
			case 'ArrowLeft':
				newIndex = Math.max(currentIndex - 1, 0)
				break
			case 'Enter':
			case ' ':
				e.preventDefault()
				onSelect(slot)
				return
		}

		if (newIndex !== currentIndex) {
			e.preventDefault()
			const buttons = e.currentTarget.parentElement?.querySelectorAll('button')
			buttons?.[newIndex]?.focus()
		}
	}

	const renderSwatch = (slot: PaletteSlotName, slots: PaletteSlotName[]) => {
		const isSelected = selectedSlot === slot
		const label = getPaletteSlotDisplayName(slot)

		return (
			<button
				key={slot}
				type="button"
				className={`c-palette-swatch c-palette-swatch--${size}${isSelected ? ' c-palette-swatch--selected' : ''}`}
				style={getSlotStyle(slot)}
				onClick={() => onSelect(slot)}
				onKeyDown={(e) => handleKeyDown(e, slot, slots)}
				title={label}
				aria-label={label}
				aria-pressed={isSelected}
			>
				{isSelected && (
					<span className="c-palette-swatch-check" style={{ color: getCheckColor(slot) }}>
						✓
					</span>
				)}
				{showLabels && <span className="c-palette-swatch-label">{label}</span>}
			</button>
		)
	}

	// Render transparent swatch
	const renderTransparentSwatch = () => (
		<button
			type="button"
			className={`c-palette-swatch c-palette-swatch--${size} c-palette-swatch--transparent${isTransparentSelected ? ' c-palette-swatch--selected' : ''}`}
			onClick={onTransparentSelect}
			title="Transparent"
			aria-label="Transparent"
			aria-pressed={isTransparentSelected}
		>
			{isTransparentSelected && (
				<span className="c-palette-swatch-check" style={{ color: '#666' }}>
					✓
				</span>
			)}
			{showLabels && <span className="c-palette-swatch-label">Transparent</span>}
		</button>
	)

	return (
		<div className={`c-palette-swatch-grid ${className}`}>
			{/* Main colors row: Transparent (optional), Background and Text */}
			<div className="c-palette-swatch-row c-palette-swatch-row--main">
				{showTransparent && renderTransparentSwatch()}
				{renderSwatch('background', colorSlots)}
				{renderSwatch('text', colorSlots)}
			</div>

			{/* Accent colors row */}
			<div className="c-palette-swatch-row c-palette-swatch-row--accents">
				{colorSlots
					.filter((slot) => slot.startsWith('accent'))
					.map((slot) => renderSwatch(slot, colorSlots))}
			</div>

			{/* Gradient swatches (if enabled) */}
			{showGradients && (
				<div className="c-palette-swatch-row c-palette-swatch-row--gradients">
					{gradientSlots.map((slot) => renderSwatch(slot, gradientSlots))}
				</div>
			)}
		</div>
	)
}

// vim: ts=4
