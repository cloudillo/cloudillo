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
import type { Gradient } from '../../types/gradient.js'
import { gradientToCSS } from '../../utils/gradient.js'

/** Direction presets with angle, label, and arrow symbol */
const ANGLE_PRESETS: Array<{ angle: number; label: string; arrow: string }> = [
	{ angle: 0, label: 'Up', arrow: '↑' },
	{ angle: 45, label: 'Up-Right', arrow: '↗' },
	{ angle: 90, label: 'Right', arrow: '→' },
	{ angle: 135, label: 'Down-Right', arrow: '↘' },
	{ angle: 180, label: 'Down', arrow: '↓' },
	{ angle: 225, label: 'Down-Left', arrow: '↙' },
	{ angle: 270, label: 'Left', arrow: '←' },
	{ angle: 315, label: 'Up-Left', arrow: '↖' }
]

export interface GradientPreviewProps extends React.HTMLAttributes<HTMLDivElement> {
	/** The gradient to preview */
	gradient: Gradient
	/** Aspect ratio (width/height), default 16/9 */
	aspectRatio?: number
	/** Show gradient type/direction control overlay */
	showTypeControl?: boolean
	/** Current angle (for highlighting active direction) */
	angle?: number
	/** Called when user clicks a direction button (switches to linear) */
	onAngleChange?: (angle: number) => void
	/** Called when user clicks the center radial button */
	onRadialSelect?: () => void
	/** Whether the control is disabled */
	disabled?: boolean
}

/**
 * Live preview of a gradient with configurable aspect ratio.
 * Optionally shows type/direction controls overlaid on the preview.
 */
export const GradientPreview = createComponent<HTMLDivElement, GradientPreviewProps>(
	'GradientPreview',
	(
		{
			className,
			gradient,
			aspectRatio = 16 / 9,
			showTypeControl = false,
			angle = 180,
			onAngleChange,
			onRadialSelect,
			disabled,
			style,
			...props
		},
		ref
	) => {
		const cssGradient = React.useMemo(() => gradientToCSS(gradient), [gradient])

		const handleAngleClick = React.useCallback(
			(newAngle: number) => {
				if (!disabled && onAngleChange) {
					onAngleChange(newAngle)
				}
			},
			[disabled, onAngleChange]
		)

		const handleRadialClick = React.useCallback(() => {
			if (!disabled && onRadialSelect) {
				onRadialSelect()
			}
		}, [disabled, onRadialSelect])

		const isLinear = gradient.type === 'linear'
		const isRadial = gradient.type === 'radial'
		// Always show overlay when showTypeControl is true, so users can switch from solid to gradient
		const showOverlay = showTypeControl

		return (
			<div
				ref={ref}
				className={mergeClasses('c-gradient-preview', className)}
				style={{
					...style,
					background: cssGradient,
					aspectRatio: aspectRatio
				}}
				role="img"
				aria-label={`Gradient preview: ${gradient.type} gradient`}
				{...props}
			>
				{showOverlay && (
					<div
						className="c-gradient-angle-overlay"
						role="group"
						aria-label="Gradient type and direction"
					>
						{/* Direction arrows for linear gradient */}
						{ANGLE_PRESETS.map(({ angle: presetAngle, label, arrow }) => (
							<button
								key={presetAngle}
								type="button"
								className={mergeClasses(
									'c-gradient-angle-btn',
									`c-gradient-angle-btn--${presetAngle}`,
									isLinear &&
										angle === presetAngle &&
										'c-gradient-angle-btn--active'
								)}
								onClick={() => handleAngleClick(presetAngle)}
								disabled={disabled}
								aria-label={`Linear: ${label} (${presetAngle}°)`}
								title={`${presetAngle}°`}
							>
								{arrow}
							</button>
						))}
						{/* Center button for radial gradient */}
						<button
							type="button"
							className={mergeClasses(
								'c-gradient-angle-btn',
								'c-gradient-angle-btn--center',
								isRadial && 'c-gradient-angle-btn--active'
							)}
							onClick={handleRadialClick}
							disabled={disabled}
							aria-label="Radial gradient"
							title="Radial"
						>
							◉
						</button>
					</div>
				)}
			</div>
		)
	}
)

// vim: ts=4
