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
 * TemplateFrame component - Renders a full-size template frame on the canvas.
 * Similar to ViewFrame but with purple color scheme for template distinction.
 */

import * as React from 'react'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'

import type { TemplateWithUsage } from '../hooks/useTemplates'
import type { TemplateLayout } from '../hooks/useTemplateLayout'

// Purple color scheme for templates
const TEMPLATE_COLOR = '#9b59b6'
const TEMPLATE_COLOR_LIGHT = 'rgba(155, 89, 182, 0.1)'

export interface TemplateFrameProps {
	template: TemplateWithUsage
	layout: TemplateLayout
	isSelected: boolean
	/** @deprecated No longer used - templates are edited directly on canvas */
	isEditing?: boolean
	onClick: (e: React.MouseEvent) => void
	onDoubleClick: (e: React.MouseEvent) => void
	readOnly?: boolean
}

export function TemplateFrame({
	template,
	layout,
	isSelected,
	onClick,
	onDoubleClick,
	readOnly
}: TemplateFrameProps) {
	// Generate unique gradient ID for this template
	const gradientId = `template-bg-${template.id}`

	// Check if we have a gradient to render
	const gradient = template.backgroundGradient
	const hasGradient =
		gradient && gradient.type !== 'solid' && gradient.stops && gradient.stops.length >= 2

	// Determine fill value
	const fill = hasGradient ? `url(#${gradientId})` : template.backgroundColor || '#ffffff'

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

	// Determine border styling based on state
	const borderColor = TEMPLATE_COLOR
	const borderWidth = isSelected ? 3 : 2
	const borderDasharray = isSelected ? 'none' : '8,4'

	// Usage badge text
	const usageText =
		template.usageCount === 0
			? 'Not used'
			: template.usageCount === 1
				? 'Used by 1 page'
				: `Used by ${template.usageCount} pages`

	return (
		<g
			className={`c-template-frame${isSelected ? ' c-template-frame--selected' : ''}`}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			style={{ cursor: readOnly ? 'default' : 'pointer' }}
		>
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
			<rect
				x={layout.x}
				y={layout.y}
				width={layout.width}
				height={layout.height}
				fill={fill}
			/>

			{/* Light purple overlay for template distinction */}
			<rect
				x={layout.x}
				y={layout.y}
				width={layout.width}
				height={layout.height}
				fill={TEMPLATE_COLOR_LIGHT}
				pointerEvents="none"
			/>

			{/* Border - purple dashed when not selected, solid when selected */}
			<rect
				x={layout.x}
				y={layout.y}
				width={layout.width}
				height={layout.height}
				fill="none"
				stroke={borderColor}
				strokeWidth={borderWidth}
				strokeDasharray={borderDasharray}
				style={
					isSelected
						? { filter: 'drop-shadow(0 0 8px rgba(155, 89, 182, 0.5))' }
						: undefined
				}
			/>

			{/* Template label above frame */}
			<text
				x={layout.x + 10}
				y={layout.y - 10}
				fill={borderColor}
				fontSize={14}
				fontWeight={isSelected ? 600 : 500}
			>
				Template: {template.name}
			</text>

			{/* Usage badge - right side of label */}
			<text
				x={layout.x + layout.width - 10}
				y={layout.y - 10}
				fill={template.usageCount > 0 ? TEMPLATE_COLOR : '#999999'}
				fontSize={12}
				fontWeight={400}
				textAnchor="end"
			>
				{usageText}
			</text>
		</g>
	)
}

// vim: ts=4
