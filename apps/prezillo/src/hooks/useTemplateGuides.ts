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
 * Hook to get template guides for the current view
 *
 * Template guides are snap guides defined in a page's template.
 * Guide visibility is local UI state only (not persisted in CRDT).
 */

import * as React from 'react'
import { useY } from 'react-yjs'
import type { YPrezilloDocument, ViewId, SnapGuide } from '../crdt'
import { getViewSnapGuides, getViewTemplate } from '../crdt'

export interface UseTemplateGuidesResult {
	/** The guides for the current view (empty if no template or no guides) */
	guides: SnapGuide[]
	/** Whether guides are visible (local UI state) */
	visible: boolean
	/** Whether the view has a template with guides */
	hasTemplateGuides: boolean
	/** Template ID if one is applied */
	templateId: string | undefined
	/** Toggle guide visibility */
	toggleVisibility: () => void
	/** Show guides */
	showGuides: () => void
	/** Hide guides */
	hideGuides: () => void
	/** Set visibility directly */
	setVisible: (visible: boolean) => void
}

/**
 * Get template guides for a view with local visibility state
 */
export function useTemplateGuides(
	doc: YPrezilloDocument,
	viewId: ViewId | null
): UseTemplateGuidesResult {
	// Subscribe to views and templates for changes
	const views = useY(doc.v)
	const templates = useY(doc.tpl)

	// Local visibility state (not persisted)
	const [visible, setVisible] = React.useState(true)

	// Get guides for the view
	const { guides, templateId, hasTemplateGuides } = React.useMemo(() => {
		if (!viewId || !views) {
			return { guides: [], templateId: undefined, hasTemplateGuides: false }
		}

		const tplId = getViewTemplate(doc, viewId)
		const viewGuides = getViewSnapGuides(doc, viewId)

		return {
			guides: viewGuides,
			templateId: tplId,
			hasTemplateGuides: viewGuides.length > 0
		}
	}, [doc, viewId, views, templates])

	// Toggle handlers
	const toggleVisibility = React.useCallback(() => {
		setVisible((v) => !v)
	}, [])

	const showGuides = React.useCallback(() => {
		setVisible(true)
	}, [])

	const hideGuides = React.useCallback(() => {
		setVisible(false)
	}, [])

	return {
		guides,
		visible,
		hasTemplateGuides,
		templateId,
		toggleVisibility,
		showGuides,
		hideGuides,
		setVisible
	}
}

/**
 * Convert template guides to additional snap targets for the snapping engine
 *
 * This creates snap targets that the useSnapping hook can use in addition
 * to object-based snapping.
 */
export function guideToSnapTargets(
	guides: SnapGuide[],
	viewBounds: { x: number; y: number; width: number; height: number }
): Array<{ type: 'horizontal' | 'vertical'; position: number }> {
	return guides.map((guide) => {
		let position: number
		if (guide.absolute) {
			position = guide.position
		} else {
			position =
				guide.direction === 'horizontal'
					? viewBounds.y + guide.position * viewBounds.height
					: viewBounds.x + guide.position * viewBounds.width
		}

		return {
			type: guide.direction,
			position
		}
	})
}

// vim: ts=4
