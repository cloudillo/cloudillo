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
import { mergeClasses, createComponent } from '@cloudillo/react'

/** Default preset angles for quick selection */
export const DEFAULT_ANGLE_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315]

/** Angle labels using arrow symbols (CSS gradient convention: clockwise from top) */
const ANGLE_LABELS: Record<number, string> = {
	0: '↑', // 0deg = bottom to top
	45: '↗', // 45deg = bottom-left to top-right
	90: '→', // 90deg = left to right (horizontal)
	135: '↘', // 135deg = top-left to bottom-right
	180: '↓', // 180deg = top to bottom (vertical)
	225: '↙', // 225deg = top-right to bottom-left
	270: '←', // 270deg = right to left
	315: '↖' // 315deg = bottom-right to top-left
}

export interface AngleControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	/** Current angle in degrees (0-360) */
	value: number
	/** Called when angle changes */
	onChange: (angle: number) => void
	/** Called during slider drag for live preview */
	onPreview?: (angle: number) => void
	/** Preset angles to show as quick buttons */
	presetAngles?: number[]
	/** Whether to show the number input */
	showInput?: boolean
	/** Whether the control is disabled */
	disabled?: boolean
}

/**
 * Angle control with preset buttons and optional number input.
 * Preset buttons show arrow symbols for visual direction indication.
 */
export const AngleControl = createComponent<HTMLDivElement, AngleControlProps>(
	'AngleControl',
	(
		{
			className,
			value,
			onChange,
			onPreview,
			presetAngles = DEFAULT_ANGLE_PRESETS,
			showInput = true,
			disabled,
			...props
		},
		ref
	) => {
		const handlePresetClick = React.useCallback(
			(angle: number) => {
				if (!disabled) {
					onChange(angle)
				}
			},
			[onChange, disabled]
		)

		const handleInputChange = React.useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				const newValue = parseInt(e.target.value, 10)
				if (!isNaN(newValue)) {
					// Normalize to 0-360
					const normalized = ((newValue % 360) + 360) % 360
					onChange(normalized)
				}
			},
			[onChange]
		)

		return (
			<div ref={ref} className={mergeClasses('c-angle-control', className)} {...props}>
				<div className="c-angle-presets" role="group" aria-label="Angle presets">
					{presetAngles.map((angle) => (
						<button
							key={angle}
							type="button"
							className={mergeClasses(
								'c-btn c-btn-sm c-angle-preset-btn',
								value === angle && 'c-btn-primary'
							)}
							onClick={() => handlePresetClick(angle)}
							disabled={disabled}
							aria-label={`${angle} degrees`}
							title={`${angle}°`}
						>
							{ANGLE_LABELS[angle] || `${angle}°`}
						</button>
					))}
				</div>
				{showInput && (
					<div className="c-angle-input-wrapper">
						<input
							type="number"
							className="c-input c-angle-input"
							value={value}
							onChange={handleInputChange}
							disabled={disabled}
							min={0}
							max={359}
							aria-label="Angle in degrees"
						/>
						<span className="c-angle-unit">°</span>
					</div>
				)}
			</div>
		)
	}
)

// vim: ts=4
