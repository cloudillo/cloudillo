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
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'

export interface ViewFrameProps {
	view: ViewNode
	isActive: boolean
	isSelected?: boolean
	onClick: () => void
}

export function ViewFrame({ view, isActive, isSelected, onClick }: ViewFrameProps) {
	// Generate unique gradient ID for this view
	const gradientId = `view-bg-${view.id}`

	// Check if we have a gradient to render
	const gradient = view.backgroundGradient
	const hasGradient =
		gradient && gradient.type !== 'solid' && gradient.stops && gradient.stops.length >= 2

	// Determine fill value
	const fill = hasGradient ? `url(#${gradientId})` : view.backgroundColor || '#ffffff'

	// Generate gradient definition
	const gradientDef = React.useMemo(() => {
		if (!hasGradient || !gradient || !gradient.stops) return null

		if (gradient.type === 'linear') {
			return {
				type: 'linear' as const,
				def: createLinearGradientDef(gradient.angle ?? 180, gradient.stops)
			}
		} else if (gradient.type === 'radial') {
			return {
				type: 'radial' as const,
				def: createRadialGradientDef(
					gradient.centerX ?? 0.5,
					gradient.centerY ?? 0.5,
					gradient.stops
				)
			}
		}
		return null
	}, [hasGradient, gradient])

	return (
		<g onClick={onClick} style={{ cursor: 'pointer' }}>
			{/* Gradient definitions */}
			{gradientDef && (
				<defs>
					{gradientDef.type === 'linear' ? (
						<linearGradient
							id={gradientId}
							x1={gradientDef.def.x1}
							y1={gradientDef.def.y1}
							x2={gradientDef.def.x2}
							y2={gradientDef.def.y2}
						>
							{gradientDef.def.stops.map((stop, i) => (
								<stop key={i} offset={stop.offset} stopColor={stop.stopColor} />
							))}
						</linearGradient>
					) : (
						<radialGradient
							id={gradientId}
							cx={gradientDef.def.cx}
							cy={gradientDef.def.cy}
							r={gradientDef.def.r}
						>
							{gradientDef.def.stops.map((stop, i) => (
								<stop key={i} offset={stop.offset} stopColor={stop.stopColor} />
							))}
						</radialGradient>
					)}
				</defs>
			)}

			{/* Background */}
			<rect x={view.x} y={view.y} width={view.width} height={view.height} fill={fill} />

			{/* Border - shows selection state */}
			<rect
				x={view.x}
				y={view.y}
				width={view.width}
				height={view.height}
				fill="none"
				stroke={
					isSelected
						? '#0066ff'
						: isActive
							? '#4a90d9'
							: view.showBorder
								? '#cccccc'
								: 'none'
				}
				strokeWidth={isSelected ? 3 : isActive ? 2 : 1}
				strokeDasharray={isSelected ? 'none' : isActive ? '8,4' : 'none'}
			/>

			{/* View name label */}
			<text
				x={view.x + 10}
				y={view.y - 10}
				fill={isSelected ? '#0066ff' : isActive ? '#4a90d9' : '#666666'}
				fontSize={14}
				fontWeight={isSelected ? 600 : 400}
			>
				{view.name}
			</text>
		</g>
	)
}

// vim: ts=4
