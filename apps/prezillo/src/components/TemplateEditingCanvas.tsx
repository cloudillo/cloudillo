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
 * Component for rendering the virtual canvas background during template editing
 */

import * as React from 'react'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'

import type { TemplateEditingContext } from '../hooks/useTemplateObjects'

export interface TemplateEditingCanvasProps {
	context: TemplateEditingContext
}

/**
 * Renders the template editing canvas background with gradient support
 */
export function TemplateEditingCanvas({ context }: TemplateEditingCanvasProps) {
	const gradient = context.backgroundGradient
	const hasGradient = gradient && gradient.type !== 'solid' && gradient.stops?.length >= 2
	const gradientId = 'template-bg-gradient'

	// Generate gradient definition
	const gradientDef = hasGradient
		? gradient.type === 'linear'
			? {
					type: 'linear' as const,
					def: createLinearGradientDef(gradient.angle ?? 180, gradient.stops)
				}
			: gradient.type === 'radial'
				? {
						type: 'radial' as const,
						def: createRadialGradientDef(
							gradient.centerX ?? 0.5,
							gradient.centerY ?? 0.5,
							gradient.stops
						)
					}
				: null
		: null

	const fill = hasGradient ? `url(#${gradientId})` : (context.backgroundColor ?? '#ffffff')

	return (
		<g>
			{/* Gradient definition */}
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
			<rect
				x={0}
				y={0}
				width={context.templateWidth}
				height={context.templateHeight}
				fill={fill}
				className="c-template-editing-canvas"
			/>
		</g>
	)
}

// vim: ts=4
