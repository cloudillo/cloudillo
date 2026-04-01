// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Zoom controls for the canvas
 * Provides zoom in/out buttons and zoom level display
 */

export interface ZoomControlsProps {
	scale: number
	onZoomIn: () => void
	onZoomOut: () => void
	onZoomReset: () => void
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onZoomReset }: ZoomControlsProps) {
	const zoomPercent = Math.round(scale * 100)

	return (
		<div className="ideallo-zoom-controls">
			<button
				className="ideallo-zoom-btn"
				onClick={onZoomOut}
				title="Zoom Out (-)"
				disabled={scale <= 0.1}
			>
				<svg viewBox="0 0 24 24" width="18" height="18">
					<line
						x1="5"
						y1="12"
						x2="19"
						y2="12"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			<button className="ideallo-zoom-level" onClick={onZoomReset} title="Reset Zoom (0)">
				{zoomPercent}%
			</button>

			<button
				className="ideallo-zoom-btn"
				onClick={onZoomIn}
				title="Zoom In (+)"
				disabled={scale >= 10}
			>
				<svg viewBox="0 0 24 24" width="18" height="18">
					<line
						x1="12"
						y1="5"
						x2="12"
						y2="19"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<line
						x1="5"
						y1="12"
						x2="19"
						y2="12"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</svg>
			</button>
		</div>
	)
}

// vim: ts=4
