// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hook for computing template frame positions on the canvas.
 * Templates are positioned right of the regular views in a "template zone".
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
	bottom: number
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
	dividerX: number | null
	viewBounds: ViewBounds | null
	emptyStatePosition: EmptyStatePosition | null
}

/** Gap between template zone and view zone */
export const TEMPLATE_ZONE_GAP = 150

/** Gap between template frames */
const TEMPLATE_GAP = 100

/**
 * Compute layout positions for template frames right of the views.
 * Templates are stacked in a column, top-aligned with the first view.
 * Also computes zone divider position and empty state position.
 */
export function useTemplateLayout(
	views: ViewNode[],
	templates: TemplateWithUsage[]
): TemplateLayoutResult {
	return React.useMemo(() => {
		const layoutMap = new Map<TemplateId, TemplateLayout>()

		let left = Infinity
		let right = -Infinity
		let top = Infinity
		let bottom = -Infinity

		for (const view of views) {
			left = Math.min(left, view.x)
			right = Math.max(right, view.x + view.width)
			top = Math.min(top, view.y)
			bottom = Math.max(bottom, view.y + view.height)
		}

		// Default to origin if no views
		if (!Number.isFinite(top)) {
			left = 0
			right = 1920
			top = 0
			bottom = 1080
		}

		// If no templates, return empty state position
		if (templates.length === 0) {
			return {
				layouts: layoutMap,
				dividerX: null,
				viewBounds: { left, right, top, bottom },
				emptyStatePosition: { x: right + TEMPLATE_ZONE_GAP + 200, y: top + 40, width: 400 }
			}
		}

		// One left-aligned column right of the views, top-aligned with the first view
		const x = right + TEMPLATE_ZONE_GAP
		let y = top
		for (const template of templates) {
			layoutMap.set(template.id, { x, y, width: template.width, height: template.height })
			y += template.height + TEMPLATE_GAP
		}

		return {
			layouts: layoutMap,
			dividerX: right + TEMPLATE_ZONE_GAP / 2,
			// Bottom covers the template column too, so the divider spans both zones
			viewBounds: { left, right, top, bottom: Math.max(bottom, y - TEMPLATE_GAP) },
			emptyStatePosition: null
		}
	}, [views, templates])
}

// vim: ts=4
