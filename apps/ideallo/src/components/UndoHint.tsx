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
 * UndoHint Component
 *
 * Shows a temporary undo badge near a Smart Ink converted shape.
 * Fades out after 2 seconds. Click to revert to original stroke.
 */

import * as React from 'react'
import type { Bounds } from '../crdt/index.js'

export interface UndoHintProps {
	/**
	 * Bounding box of the converted shape (to position the hint)
	 */
	bounds: Bounds

	/**
	 * Callback when user clicks to undo
	 */
	onUndo: () => void

	/**
	 * Duration before the hint fades out (default 2000ms)
	 */
	duration?: number
}

const FADE_DURATION = 500 // ms for fade animation

export function UndoHint({ bounds, onUndo, duration = 2000 }: UndoHintProps) {
	const [opacity, setOpacity] = React.useState(0.7)
	const [visible, setVisible] = React.useState(true)

	React.useEffect(() => {
		// Start fade-out timer
		const fadeTimer = setTimeout(() => {
			setOpacity(0)
		}, duration)

		// Remove from DOM after fade completes
		const removeTimer = setTimeout(() => {
			setVisible(false)
		}, duration + FADE_DURATION)

		return () => {
			clearTimeout(fadeTimer)
			clearTimeout(removeTimer)
		}
	}, [duration])

	if (!visible) return null

	// Position hint at top-right of bounds
	const hintX = bounds.x + bounds.width + 8
	const hintY = bounds.y - 8
	const size = 24

	return (
		<g
			transform={`translate(${hintX}, ${hintY})`}
			style={{
				opacity,
				transition: `opacity ${FADE_DURATION}ms ease-out`,
				cursor: 'pointer'
			}}
			onClick={(e) => {
				e.stopPropagation()
				onUndo()
			}}
			role="button"
			aria-label="Undo shape detection"
		>
			{/* Background circle */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={size / 2}
				fill="white"
				stroke="#868e96"
				strokeWidth={1}
				filter="drop-shadow(0 1px 2px rgba(0,0,0,0.1))"
			/>

			{/* Undo arrow icon */}
			<path
				d={`
					M ${size * 0.3} ${size * 0.5}
					A ${size * 0.22} ${size * 0.22} 0 1 1 ${size * 0.7} ${size * 0.5}
					M ${size * 0.25} ${size * 0.35}
					L ${size * 0.3} ${size * 0.5}
					L ${size * 0.45} ${size * 0.4}
				`}
				fill="none"
				stroke="#495057"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</g>
	)
}

// vim: ts=4
