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
 * Template thumbnail component for the templates row on canvas.
 * Renders a scaled-down preview of a template with selection state.
 */

import * as React from 'react'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'

import type { Template, TemplateId, PrezilloObject } from '../crdt'
import type { Gradient } from '@cloudillo/canvas-tools'

export interface TemplateThumbnailProps {
	template: Template
	/** Prototype objects in this template (for preview rendering) */
	objects: PrezilloObject[]
	/** Number of views using this template */
	usageCount: number
	/** Position on canvas */
	x: number
	y: number
	/** Thumbnail dimensions */
	width: number
	height: number
	/** Whether this template is selected */
	isSelected: boolean
	/** Whether this template is being edited */
	isEditing: boolean
	/** Click handler */
	onClick: (e: React.MouseEvent) => void
	/** Double-click handler */
	onDoubleClick: (e: React.MouseEvent) => void
	/** Read-only mode */
	readOnly?: boolean
}

export function TemplateThumbnail({
	template,
	objects,
	usageCount,
	x,
	y,
	width,
	height,
	isSelected,
	isEditing,
	onClick,
	onDoubleClick,
	readOnly
}: TemplateThumbnailProps) {
	// Calculate scale factor for preview rendering
	const scaleX = width / template.width
	const scaleY = height / template.height
	const scale = Math.min(scaleX, scaleY)

	// Gradient handling for template background
	const gradient = template.backgroundGradient
	const gradientStops = gradient?.stops
	const hasGradient =
		gradient && gradient.type !== 'solid' && gradientStops && gradientStops.length >= 2
	const gradientId = `tpl-thumb-grad-${template.id}`

	// Generate gradient definition
	const gradientDef =
		hasGradient && gradientStops
			? gradient.type === 'linear'
				? {
						type: 'linear' as const,
						def: createLinearGradientDef(gradient.angle ?? 180, gradientStops)
					}
				: gradient.type === 'radial'
					? {
							type: 'radial' as const,
							def: createRadialGradientDef(
								gradient.centerX ?? 0.5,
								gradient.centerY ?? 0.5,
								gradientStops
							)
						}
					: null
			: null

	const backgroundFill = hasGradient
		? `url(#${gradientId})`
		: (template.backgroundColor ?? '#ffffff')

	// Selection/editing state colors
	const borderColor = isEditing ? '#22c55e' : isSelected ? '#3b82f6' : '#d1d5db'
	const borderWidth = isSelected || isEditing ? 3 : 1

	// Badge text
	const badgeText =
		usageCount > 0 ? `${usageCount} page${usageCount !== 1 ? 's' : ''}` : 'Not used'

	return (
		<g className="c-template-thumbnail" onClick={onClick} onDoubleClick={onDoubleClick}>
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

			{/* Outer frame with selection border */}
			<rect
				x={x - 2}
				y={y - 2}
				width={width + 4}
				height={height + 4}
				rx={6}
				fill="transparent"
				stroke={borderColor}
				strokeWidth={borderWidth}
				style={{ cursor: readOnly ? 'default' : 'pointer' }}
			/>

			{/* Template background preview */}
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				rx={4}
				fill={backgroundFill}
				style={{ cursor: readOnly ? 'default' : 'pointer' }}
			/>

			{/* Simplified preview of objects (just colored rectangles for performance) */}
			<g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={0.6}>
				{objects.slice(0, 10).map((obj) => (
					<rect
						key={obj.id}
						x={obj.x}
						y={obj.y}
						width={obj.width}
						height={obj.height}
						rx={obj.type === 'ellipse' ? Math.min(obj.width, obj.height) / 2 : 4}
						fill={obj.type === 'text' ? 'transparent' : '#888888'}
						stroke={obj.type === 'text' ? '#666666' : 'transparent'}
						strokeWidth={obj.type === 'text' ? 2 / scale : 0}
						strokeDasharray={obj.type === 'text' ? `${4 / scale}` : undefined}
					/>
				))}
			</g>

			{/* Template name label */}
			<text
				x={x + width / 2}
				y={y + height + 18}
				textAnchor="middle"
				fontSize={14}
				fontWeight={isSelected || isEditing ? 600 : 400}
				fill={isEditing ? '#22c55e' : isSelected ? '#3b82f6' : '#374151'}
			>
				{template.name}
			</text>

			{/* Usage count badge */}
			<text
				x={x + width / 2}
				y={y + height + 34}
				textAnchor="middle"
				fontSize={11}
				fill="#6b7280"
			>
				{badgeText}
			</text>
		</g>
	)
}

// vim: ts=4
