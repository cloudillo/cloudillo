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
 * Hook for computing template frame positions on the canvas.
 * Templates are positioned above regular views in a "template zone".
 */

import * as React from 'react'

import type { TemplateId, ViewNode } from '../crdt'
import type { TemplateWithUsage } from './useTemplates'

/** Layout information for a template frame */
export interface TemplateLayout {
	x: number
	y: number
	width: number
	height: number
}

/** View bounds for zone divider positioning */
export interface ViewBounds {
	left: number
	right: number
	top: number
}

/** Empty state position for when no templates exist */
export interface EmptyStatePosition {
	x: number
	y: number
	width: number
}

/** Complete result from the template layout hook */
export interface TemplateLayoutResult {
	layouts: Map<TemplateId, TemplateLayout>
	dividerY: number | null
	viewBounds: ViewBounds | null
	emptyStatePosition: EmptyStatePosition | null
}

/** Gap between template zone and view zone */
export const TEMPLATE_ZONE_GAP = 150

/** Gap between template frames */
const TEMPLATE_GAP = 100

/**
 * Compute layout positions for template frames above the views.
 * Templates are arranged horizontally, centered above the views.
 * Also computes zone divider position and empty state position.
 */
export function useTemplateLayout(
	views: ViewNode[],
	templates: TemplateWithUsage[]
): TemplateLayoutResult {
	return React.useMemo(() => {
		const layoutMap = new Map<TemplateId, TemplateLayout>()

		// Find the topmost view Y position and view bounds
		let topViewY = Infinity
		let leftmostViewX = Infinity
		let rightmostViewX = -Infinity

		for (const view of views) {
			topViewY = Math.min(topViewY, view.y)
			leftmostViewX = Math.min(leftmostViewX, view.x)
			rightmostViewX = Math.max(rightmostViewX, view.x + view.width)
		}

		// Default to origin if no views
		if (!isFinite(topViewY)) {
			topViewY = 0
			leftmostViewX = 0
			rightmostViewX = 1920
		}

		const viewBounds: ViewBounds = {
			left: leftmostViewX,
			right: rightmostViewX,
			top: topViewY
		}

		// If no templates, return empty state position
		if (templates.length === 0) {
			const viewsCenterX = (leftmostViewX + rightmostViewX) / 2
			const viewsWidth = rightmostViewX - leftmostViewX

			return {
				layouts: layoutMap,
				dividerY: null,
				viewBounds,
				emptyStatePosition: {
					x: viewsCenterX,
					y: topViewY - 200,
					width: Math.min(viewsWidth, 600)
				}
			}
		}

		// Find the tallest template to determine template zone Y
		const maxTemplateHeight = Math.max(...templates.map((t) => t.height))

		// Template zone Y position (above views)
		const templateZoneY = topViewY - TEMPLATE_ZONE_GAP - maxTemplateHeight

		// Divider Y is in the middle of the gap between templates and views
		const dividerY = topViewY - TEMPLATE_ZONE_GAP / 2

		// Calculate total width of all templates with gaps
		const totalTemplateWidth = templates.reduce(
			(sum, t, i) => sum + t.width + (i < templates.length - 1 ? TEMPLATE_GAP : 0),
			0
		)

		// Center templates above the views
		const viewsCenterX = (leftmostViewX + rightmostViewX) / 2
		let currentX = viewsCenterX - totalTemplateWidth / 2

		// Position each template
		for (const template of templates) {
			// Vertically align template bottom with template zone bottom
			const templateY = templateZoneY + maxTemplateHeight - template.height

			layoutMap.set(template.id, {
				x: currentX,
				y: templateY,
				width: template.width,
				height: template.height
			})

			currentX += template.width + TEMPLATE_GAP
		}

		return {
			layouts: layoutMap,
			dividerY,
			viewBounds,
			emptyStatePosition: null
		}
	}, [views, templates])
}

// vim: ts=4
