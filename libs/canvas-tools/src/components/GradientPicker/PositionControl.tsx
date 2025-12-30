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

/** Position preset for radial gradient center */
interface PositionPreset {
	id: string
	x: number
	y: number
	label: string
}

/** 3x3 grid of position presets */
const POSITION_PRESETS: PositionPreset[] = [
	{ id: 'tl', x: 0, y: 0, label: '↖' },
	{ id: 'tc', x: 0.5, y: 0, label: '↑' },
	{ id: 'tr', x: 1, y: 0, label: '↗' },
	{ id: 'ml', x: 0, y: 0.5, label: '←' },
	{ id: 'mc', x: 0.5, y: 0.5, label: '●' },
	{ id: 'mr', x: 1, y: 0.5, label: '→' },
	{ id: 'bl', x: 0, y: 1, label: '↙' },
	{ id: 'bc', x: 0.5, y: 1, label: '↓' },
	{ id: 'br', x: 1, y: 1, label: '↘' }
]

export interface PositionControlProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	/** Center X position (0-1) */
	x: number
	/** Center Y position (0-1) */
	y: number
	/** Called when position changes */
	onChange: (x: number, y: number) => void
	/** Called during interaction for live preview */
	onPreview?: (x: number, y: number) => void
	/** Whether the control is disabled */
	disabled?: boolean
}

/**
 * Position control for radial gradient center.
 * Shows a 3x3 grid of preset positions.
 */
export const PositionControl = createComponent<HTMLDivElement, PositionControlProps>(
	'PositionControl',
	({ className, x, y, onChange, onPreview, disabled, ...props }, ref) => {
		// Find current preset (if any matches)
		const currentPresetId = React.useMemo(() => {
			const preset = POSITION_PRESETS.find(
				(p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01
			)
			return preset?.id
		}, [x, y])

		const handlePresetClick = React.useCallback(
			(preset: PositionPreset) => {
				if (!disabled) {
					onChange(preset.x, preset.y)
				}
			},
			[onChange, disabled]
		)

		return (
			<div ref={ref} className={mergeClasses('c-position-control', className)} {...props}>
				<div className="c-position-grid" role="group" aria-label="Gradient center position">
					{POSITION_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className={mergeClasses(
								'c-btn c-btn-sm c-position-btn',
								currentPresetId === preset.id && 'c-btn-primary'
							)}
							onClick={() => handlePresetClick(preset)}
							disabled={disabled}
							aria-label={`Position: ${preset.id === 'mc' ? 'center' : preset.id}`}
							title={
								preset.id === 'mc'
									? 'Center'
									: `${Math.round(preset.x * 100)}%, ${Math.round(preset.y * 100)}%`
							}
						>
							{preset.label}
						</button>
					))}
				</div>
			</div>
		)
	}
)

// vim: ts=4
