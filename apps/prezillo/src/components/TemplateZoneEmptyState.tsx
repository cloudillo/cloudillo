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
 * TemplateZoneEmptyState component - Shows a call-to-action
 * when no templates exist in the presentation.
 */

import * as React from 'react'

// Template color scheme (matches TemplateFrame)
const TEMPLATE_COLOR = '#9b59b6'

export interface TemplateZoneEmptyStateProps {
	x: number
	y: number
	width: number
	readOnly?: boolean
	onCreateTemplate?: () => void
}

export function TemplateZoneEmptyState({
	x,
	y,
	width,
	readOnly,
	onCreateTemplate
}: TemplateZoneEmptyStateProps) {
	const [isHovered, setIsHovered] = React.useState(false)

	const boxWidth = Math.min(width, 400)
	const boxHeight = 80
	const boxX = x - boxWidth / 2
	const boxY = y - boxHeight / 2

	return (
		<g
			className="c-template-empty-state"
			style={{ cursor: readOnly ? 'default' : 'pointer' }}
			onClick={readOnly ? undefined : onCreateTemplate}
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
		>
			{/* Background */}
			<rect
				x={boxX}
				y={boxY}
				width={boxWidth}
				height={boxHeight}
				fill={
					isHovered && !readOnly ? 'rgba(155, 89, 182, 0.1)' : 'rgba(155, 89, 182, 0.05)'
				}
				stroke={TEMPLATE_COLOR}
				strokeWidth={isHovered && !readOnly ? 2 : 1}
				strokeDasharray="6,4"
				rx={8}
				ry={8}
			/>

			{/* Layers icon (simple SVG path) */}
			<g transform={`translate(${boxX + 24}, ${boxY + 28})`} opacity={0.6}>
				<path
					d="M12 2L2 7l10 5 10-5-10-5zm0 6.5L5.5 7 12 5l6.5 2L12 8.5zM2 17l10 5 10-5M2 12l10 5 10-5"
					fill="none"
					stroke={TEMPLATE_COLOR}
					strokeWidth={1.5}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>

			{/* Title text */}
			<text
				x={boxX + 56}
				y={boxY + 32}
				fill={TEMPLATE_COLOR}
				fontSize={14}
				fontWeight={500}
				opacity={0.8}
			>
				No templates yet
			</text>

			{/* Description text */}
			<text x={boxX + 56} y={boxY + 52} fill={TEMPLATE_COLOR} fontSize={12} opacity={0.6}>
				{readOnly
					? 'Templates define reusable page layouts'
					: 'Click to create a template for reusable layouts'}
			</text>
		</g>
	)
}

// vim: ts=4
