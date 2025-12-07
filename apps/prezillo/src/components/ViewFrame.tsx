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
 * ViewFrame component - Renders a view/slide frame on the canvas
 */

import * as React from 'react'
import type { ViewNode } from '../crdt'

export interface ViewFrameProps {
	view: ViewNode
	isActive: boolean
	onClick: () => void
}

export function ViewFrame({ view, isActive, onClick }: ViewFrameProps) {
	return (
		<g onClick={onClick} style={{ cursor: 'pointer' }}>
			{/* Background */}
			<rect
				x={view.x}
				y={view.y}
				width={view.width}
				height={view.height}
				fill={view.backgroundColor || '#ffffff'}
			/>

			{/* Border */}
			{view.showBorder && (
				<rect
					x={view.x}
					y={view.y}
					width={view.width}
					height={view.height}
					fill="none"
					stroke={isActive ? '#0066ff' : '#cccccc'}
					strokeWidth={isActive ? 3 : 1}
				/>
			)}

			{/* View name label */}
			<text
				x={view.x + 10}
				y={view.y - 10}
				fill={isActive ? '#0066ff' : '#666666'}
				fontSize={14}
			>
				{view.name}
			</text>
		</g>
	)
}

// vim: ts=4
