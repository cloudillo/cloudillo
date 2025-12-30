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
 * PaletteColorPicker - Tabbed color picker with Theme and Custom tabs
 */

import * as React from 'react'
import { ColorInput } from '@cloudillo/react'

import type { Palette, PaletteSlotName, PaletteRef, StoredPaletteRef } from '../../crdt'
import {
	createPaletteRef,
	getResolvedColor,
	isPaletteRef,
	expandPaletteRef,
	isGradientSlot
} from '../../crdt'
import { PaletteSwatchGrid } from './PaletteSwatchGrid'

import './PaletteColorPicker.css'

export type ColorPickerValue = string | StoredPaletteRef

export interface PaletteColorPickerProps {
	/** Current value (hex string or palette reference) */
	value?: ColorPickerValue
	/** Called when value changes */
	onChange: (value: ColorPickerValue) => void
	/** Called during color drag for live preview (doesn't commit) */
	onPreview?: (color: string) => void
	/** Called when user detaches from palette (converts to custom) */
	onDetach?: () => void
	/** The document's palette */
	palette: Palette
	/** Show gradient options in palette */
	showGradients?: boolean
	/** Show transparent/none option */
	showTransparent?: boolean
	/** Show opacity slider */
	showOpacity?: boolean
	/** Current opacity (0-1) - only used if showOpacity is true */
	opacity?: number
	/** Called when opacity changes */
	onOpacityChange?: (opacity: number) => void
	/** Disabled state */
	disabled?: boolean
	/** Class name */
	className?: string
}

type TabType = 'theme' | 'custom'

/**
 * Tabbed color picker with Theme (palette swatches) and Custom (full picker) tabs
 */
export function PaletteColorPicker({
	value,
	onChange,
	onPreview,
	onDetach,
	palette,
	showGradients = false,
	showTransparent = false,
	showOpacity = false,
	opacity = 1,
	onOpacityChange,
	disabled = false,
	className = ''
}: PaletteColorPickerProps) {
	// Check if value is transparent/none
	const isTransparent = value === 'none'

	// Determine if current value is a palette reference
	const isPaletteValue = value !== undefined && !isTransparent && isPaletteRef(value)
	const paletteRef = isPaletteValue ? expandPaletteRef(value as StoredPaletteRef) : null

	// Get the currently selected palette slot (if using palette)
	const selectedSlot = paletteRef?.slotId ?? null

	// Get the resolved color for display (use transparent for 'none')
	const resolvedColor = isTransparent
		? 'transparent'
		: getResolvedColor(palette, value, '#cccccc')

	// Determine initial tab based on current value
	// Transparent is selected from theme tab, so treat it as a theme value
	const [activeTab, setActiveTab] = React.useState<TabType>(
		isPaletteValue || isTransparent ? 'theme' : 'custom'
	)

	// Update tab when value type changes externally
	React.useEffect(() => {
		if ((isPaletteValue || isTransparent) && activeTab !== 'theme') {
			setActiveTab('theme')
		}
	}, [isPaletteValue, isTransparent, activeTab])

	// Handle palette slot selection
	const handleSlotSelect = React.useCallback(
		(slot: PaletteSlotName) => {
			// Don't allow selecting gradient slots if showGradients is false
			if (!showGradients && isGradientSlot(slot)) {
				return
			}

			// Create a palette reference with the current opacity from props
			const ref = createPaletteRef(slot, opacity !== 1 ? opacity : undefined)
			onChange(ref)
		},
		[onChange, showGradients, opacity]
	)

	// Handle transparent selection
	const handleTransparentSelect = React.useCallback(() => {
		onChange('none')
	}, [onChange])

	// Handle custom color change
	const handleCustomColorChange = React.useCallback(
		(color: string) => {
			onChange(color)
		},
		[onChange]
	)

	// Handle detach (convert palette ref to custom color)
	const handleDetach = React.useCallback(() => {
		if (isPaletteValue) {
			// Get the resolved color and switch to custom
			const color = getResolvedColor(palette, value, '#cccccc')
			onChange(color)
			setActiveTab('custom')
			onDetach?.()
		}
	}, [isPaletteValue, palette, value, onChange, onDetach])

	// Handle opacity change
	const handleOpacityChange = React.useCallback(
		(newOpacity: number) => {
			onOpacityChange?.(newOpacity)

			// If using palette ref, update the ref with new opacity
			if (isPaletteValue && paletteRef) {
				const ref = createPaletteRef(
					paletteRef.slotId,
					newOpacity !== 1 ? newOpacity : undefined,
					paletteRef.tint
				)
				onChange(ref)
			}
		},
		[isPaletteValue, paletteRef, onChange, onOpacityChange]
	)

	return (
		<div className={`c-palette-color-picker ${className}`}>
			{/* Tab buttons */}
			<div className="c-palette-color-picker-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					className={`c-palette-color-picker-tab${activeTab === 'theme' ? ' c-palette-color-picker-tab--active' : ''}`}
					onClick={() => setActiveTab('theme')}
					aria-selected={activeTab === 'theme'}
					disabled={disabled}
				>
					Theme
				</button>
				<button
					type="button"
					role="tab"
					className={`c-palette-color-picker-tab${activeTab === 'custom' ? ' c-palette-color-picker-tab--active' : ''}`}
					onClick={() => setActiveTab('custom')}
					aria-selected={activeTab === 'custom'}
					disabled={disabled}
				>
					Custom
				</button>
			</div>

			{/* Tab content */}
			<div className="c-palette-color-picker-content">
				{activeTab === 'theme' ? (
					<div className="c-palette-color-picker-theme">
						<PaletteSwatchGrid
							palette={palette}
							selectedSlot={selectedSlot}
							onSelect={handleSlotSelect}
							showGradients={showGradients}
							showTransparent={showTransparent}
							isTransparentSelected={isTransparent}
							onTransparentSelect={handleTransparentSelect}
							showLabels={true}
							size="md"
						/>

						{/* Detach button (only show if using palette) */}
						{isPaletteValue && (
							<button
								type="button"
								className="c-palette-color-picker-detach"
								onClick={handleDetach}
								disabled={disabled}
							>
								Detach from theme
							</button>
						)}
					</div>
				) : (
					<div className="c-palette-color-picker-custom">
						<ColorInput
							value={resolvedColor}
							onChange={handleCustomColorChange}
							onPreview={onPreview}
							disabled={disabled}
							showHex={true}
						/>
					</div>
				)}

				{/* Opacity slider (shown in both tabs if enabled) */}
				{showOpacity && (
					<div className="c-palette-color-picker-opacity">
						<label className="c-palette-color-picker-opacity-label">Opacity</label>
						<input
							type="range"
							className="c-slider"
							value={isPaletteValue ? (paletteRef?.opacity ?? 1) : opacity}
							onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
							min={0}
							max={1}
							step={0.01}
							disabled={disabled}
						/>
						<span className="c-palette-color-picker-opacity-value">
							{Math.round(
								(isPaletteValue ? (paletteRef?.opacity ?? 1) : opacity) * 100
							)}
							%
						</span>
					</div>
				)}
			</div>

			{/* Color preview swatch */}
			<div
				className={`c-palette-color-picker-preview${isTransparent ? ' c-palette-color-picker-preview--transparent' : ''}`}
				style={isTransparent ? undefined : { backgroundColor: resolvedColor }}
				title={
					isTransparent
						? 'Transparent'
						: isPaletteValue
							? `Theme: ${selectedSlot}`
							: `Custom: ${resolvedColor}`
				}
			>
				{isPaletteValue && <span className="c-palette-color-picker-preview-badge">T</span>}
			</div>
		</div>
	)
}

// vim: ts=4
