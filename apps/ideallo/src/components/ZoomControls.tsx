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
 * Zoom controls for the canvas
 * Provides zoom in/out buttons and zoom level display
 */

import * as React from 'react'

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
