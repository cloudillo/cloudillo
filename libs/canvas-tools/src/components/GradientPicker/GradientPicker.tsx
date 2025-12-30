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

import * as React from 'react'
import { mergeClasses, createComponent, ColorInput } from '@cloudillo/react'
import type { Gradient, GradientStop } from '../../types/gradient.js'
import {
	DEFAULT_LINEAR_GRADIENT,
	DEFAULT_RADIAL_GRADIENT,
	updateStop
} from '../../utils/gradient.js'
import { GradientPreview } from './GradientPreview.js'
import { GradientBar } from './GradientBar.js'
import { GradientPresetGrid } from './GradientPresetGrid.js'

export interface GradientPickerProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	/** Current gradient value */
	value: Gradient
	/** Called when gradient changes (debounced, for CRDT commit) */
	onChange: (gradient: Gradient) => void
	/** Called during editing for live preview (not committed) */
	onPreview?: (gradient: Gradient) => void
	/** Aspect ratio for preview (default 16/9) */
	aspectRatio?: number
	/** Whether to show preset grid */
	showPresets?: boolean
	/** Maximum presets to show (default 8) */
	maxPresets?: number
	/** Whether the control is disabled */
	disabled?: boolean
}

/**
 * Gradient picker with visual type/direction controls in preview overlay.
 * - Click direction arrows to select linear gradient with that angle
 * - Click center icon to select radial gradient
 */
export const GradientPicker = createComponent<HTMLDivElement, GradientPickerProps>(
	'GradientPicker',
	(
		{
			className,
			value,
			onChange,
			onPreview,
			aspectRatio = 16 / 9,
			showPresets = true,
			maxPresets = 8,
			disabled,
			...props
		},
		ref
	) => {
		// Local state for preview during editing
		const [previewGradient, setPreviewGradient] = React.useState<Gradient | null>(null)
		const [selectedStopIndex, setSelectedStopIndex] = React.useState(0)

		// Debounce timer
		const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

		// Current display gradient (preview if editing, otherwise value)
		const displayGradient = previewGradient ?? value

		// Cleanup on unmount
		React.useEffect(() => {
			return () => {
				if (debounceTimerRef.current) {
					clearTimeout(debounceTimerRef.current)
				}
			}
		}, [])

		// Debounced commit
		const commitGradient = React.useCallback(
			(gradient: Gradient) => {
				if (debounceTimerRef.current) {
					clearTimeout(debounceTimerRef.current)
				}
				debounceTimerRef.current = setTimeout(() => {
					onChange(gradient)
					setPreviewGradient(null)
				}, 1000)
			},
			[onChange]
		)

		// Immediate commit (for blur or explicit actions)
		const commitImmediately = React.useCallback(
			(gradient: Gradient) => {
				if (debounceTimerRef.current) {
					clearTimeout(debounceTimerRef.current)
					debounceTimerRef.current = null
				}
				onChange(gradient)
				setPreviewGradient(null)
			},
			[onChange]
		)

		// Handle stops change
		const handleStopsChange = React.useCallback(
			(stops: GradientStop[]) => {
				const newGradient: Gradient = { ...value, stops }
				commitGradient(newGradient)
			},
			[value, commitGradient]
		)

		// Handle stops preview
		const handleStopsPreview = React.useCallback(
			(stops: GradientStop[]) => {
				const preview: Gradient = { ...value, stops }
				setPreviewGradient(preview)
				onPreview?.(preview)
			},
			[value, onPreview]
		)

		// Handle stop color change
		const handleStopColorChange = React.useCallback(
			(color: string) => {
				const stops = value.stops ?? []
				if (selectedStopIndex >= 0 && selectedStopIndex < stops.length) {
					const newStops = updateStop(stops, selectedStopIndex, { color })
					const newGradient: Gradient = { ...value, stops: newStops }
					commitImmediately(newGradient)
				}
			},
			[value, selectedStopIndex, commitImmediately]
		)

		// Handle stop color preview
		const handleStopColorPreview = React.useCallback(
			(color: string) => {
				const stops = value.stops ?? []
				if (selectedStopIndex >= 0 && selectedStopIndex < stops.length) {
					const newStops = updateStop(stops, selectedStopIndex, { color })
					const preview: Gradient = { ...value, stops: newStops }
					setPreviewGradient(preview)
					onPreview?.(preview)
				}
			},
			[value, selectedStopIndex, onPreview]
		)

		// Handle angle change (switches to linear if not already)
		const handleAngleChange = React.useCallback(
			(angle: number) => {
				if (value.type === 'linear') {
					const newGradient: Gradient = { ...value, angle }
					commitImmediately(newGradient)
				} else {
					// Switch to linear with the selected angle
					const newGradient: Gradient = {
						...DEFAULT_LINEAR_GRADIENT,
						stops:
							value.stops && value.stops.length >= 2
								? value.stops
								: DEFAULT_LINEAR_GRADIENT.stops,
						angle
					}
					commitImmediately(newGradient)
				}
			},
			[value, commitImmediately]
		)

		// Handle radial selection
		const handleRadialSelect = React.useCallback(() => {
			if (value.type !== 'radial') {
				const newGradient: Gradient = {
					...DEFAULT_RADIAL_GRADIENT,
					stops:
						value.stops && value.stops.length >= 2
							? value.stops
							: DEFAULT_RADIAL_GRADIENT.stops
				}
				commitImmediately(newGradient)
			}
		}, [value, commitImmediately])

		// Handle preset selection
		const handlePresetSelect = React.useCallback(
			(preset: Gradient) => {
				commitImmediately(preset)
			},
			[commitImmediately]
		)

		const selectedStop = value.stops?.[selectedStopIndex]

		return (
			<div ref={ref} className={mergeClasses('c-gradient-picker', className)} {...props}>
				{/* Preview with type/direction overlay controls */}
				<GradientPreview
					gradient={displayGradient}
					aspectRatio={aspectRatio}
					showTypeControl={true}
					angle={displayGradient.angle ?? 180}
					onAngleChange={handleAngleChange}
					onRadialSelect={handleRadialSelect}
					disabled={disabled}
				/>

				{/* Gradient controls */}
				{(displayGradient.type === 'linear' || displayGradient.type === 'radial') && (
					<>
						{/* Presets */}
						{showPresets && (
							<div className="c-gradient-presets-section">
								<GradientPresetGrid
									onSelect={handlePresetSelect}
									maxItems={maxPresets}
								/>
							</div>
						)}

						{/* Gradient bar */}
						<GradientBar
							stops={displayGradient.stops ?? []}
							onChange={handleStopsChange}
							onPreview={handleStopsPreview}
							selectedIndex={selectedStopIndex}
							onSelectStop={setSelectedStopIndex}
							disabled={disabled}
						/>

						{/* Selected stop color */}
						{selectedStop && (
							<div className="c-gradient-stop-controls c-hbox g-2">
								<div className="c-gradient-stop-color">
									<label className="c-label">Color</label>
									<ColorInput
										value={selectedStop.color}
										onChange={handleStopColorChange}
										onPreview={handleStopColorPreview}
										disabled={disabled}
									/>
								</div>
								<div className="c-gradient-stop-position">
									<label className="c-label">Position</label>
									<span className="c-gradient-position-display">
										{Math.round(selectedStop.position * 100)}%
									</span>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		)
	}
)

// vim: ts=4
