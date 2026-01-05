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
 * TemplateGuideRenderer component - Renders template snap guides on the canvas
 *
 * Renders horizontal and vertical guide lines from a page's template.
 * Guides are shown as subtle dashed lines to help with object alignment.
 */

import * as React from 'react'
import type { SnapGuide, ViewNode } from '../crdt'

export interface TemplateGuideRendererProps {
	view: ViewNode
	guides: SnapGuide[]
	visible?: boolean
	color?: string
}

/**
 * Renders template snap guides as SVG lines within a view
 */
export function TemplateGuideRenderer({
	view,
	guides,
	visible = true,
	color = '#ff6b9d'
}: TemplateGuideRendererProps) {
	if (!visible || guides.length === 0) {
		return null
	}

	return (
		<g className="template-guides" pointerEvents="none">
			{guides.map((guide, index) => {
				// Calculate the actual position based on guide settings
				let position: number
				if (guide.absolute) {
					// Absolute position in pixels
					position = guide.position
				} else {
					// Percentage position (0-1)
					position =
						guide.direction === 'horizontal'
							? guide.position * view.height
							: guide.position * view.width
				}

				if (guide.direction === 'horizontal') {
					// Horizontal guide - line across the width at a specific y
					const y = view.y + position
					return (
						<line
							key={`guide-h-${index}`}
							x1={view.x}
							y1={y}
							x2={view.x + view.width}
							y2={y}
							stroke={color}
							strokeWidth={1}
							strokeDasharray="8,4"
							strokeOpacity={0.6}
						/>
					)
				} else {
					// Vertical guide - line across the height at a specific x
					const x = view.x + position
					return (
						<line
							key={`guide-v-${index}`}
							x1={x}
							y1={view.y}
							x2={x}
							y2={view.y + view.height}
							stroke={color}
							strokeWidth={1}
							strokeDasharray="8,4"
							strokeOpacity={0.6}
						/>
					)
				}
			})}
		</g>
	)
}

/**
 * Hook to manage template guide visibility state (local UI state)
 * Returns a toggle function and current visibility state
 */
export function useTemplateGuideVisibility(initialVisible: boolean = true) {
	const [visible, setVisible] = React.useState(initialVisible)

	const toggle = React.useCallback(() => {
		setVisible((v) => !v)
	}, [])

	const show = React.useCallback(() => {
		setVisible(true)
	}, [])

	const hide = React.useCallback(() => {
		setVisible(false)
	}, [])

	return {
		visible,
		toggle,
		show,
		hide,
		setVisible
	}
}

// vim: ts=4
