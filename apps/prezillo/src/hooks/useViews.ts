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
