// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for getting document views
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { YPrezilloDocument, ViewNode } from '../crdt'
import { getAllViews, resolveViewBackground } from '../crdt'

/**
 * Get all views in presentation order with resolved backgrounds (including template inheritance)
 */
export function useViews(doc: YPrezilloDocument): ViewNode[] {
	const views = useY(doc.v)
	const viewOrder = useY(doc.vo)
	const templates = useY(doc.tpl)

	return React.useMemo(() => {
		if (!views || !viewOrder) return []

		// Get all views and enhance with resolved backgrounds from templates
		return getAllViews(doc).map((view) => {
			const resolved = resolveViewBackground(doc, view.id)
			return {
				...view,
				// Override with resolved background values (includes template inheritance)
				backgroundColor: resolved.backgroundColor ?? view.backgroundColor,
				backgroundGradient: resolved.backgroundGradient ?? view.backgroundGradient,
				backgroundImage: resolved.backgroundImage ?? view.backgroundImage,
				backgroundFit: resolved.backgroundFit ?? view.backgroundFit
			}
		})
	}, [doc, views, viewOrder, templates])
}

// vim: ts=4
