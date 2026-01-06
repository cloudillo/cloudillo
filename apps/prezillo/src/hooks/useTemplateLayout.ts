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

/** Gap between template zone and view zone */
const TEMPLATE_ZONE_GAP = 150

/** Gap between template frames */
const TEMPLATE_GAP = 100

/**
 * Compute layout positions for template frames above the views.
 * Templates are arranged horizontally, centered above the views.
 */
export function useTemplateLayout(
	views: ViewNode[],
	templates: TemplateWithUsage[]
): Map<TemplateId, TemplateLayout> {
	return React.useMemo(() => {
		const layoutMap = new Map<TemplateId, TemplateLayout>()

		if (templates.length === 0) {
			return layoutMap
		}

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

		// Find the tallest template to determine template zone Y
		const maxTemplateHeight = Math.max(...templates.map((t) => t.height))

		// Template zone Y position (above views)
		const templateZoneY = topViewY - TEMPLATE_ZONE_GAP - maxTemplateHeight

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

		return layoutMap
	}, [views, templates])
}

// vim: ts=4
