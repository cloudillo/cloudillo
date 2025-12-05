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

import type { YPrezilloDocument, ViewNode, ViewId } from '../crdt'
import { getAllViews, getView, toViewId } from '../crdt'

/**
 * Get all views in presentation order
 */
export function useViews(doc: YPrezilloDocument): ViewNode[] {
	const views = useY(doc.v)
	const viewOrder = useY(doc.vo)

	return React.useMemo(() => {
		if (!views || !viewOrder) return []
		return getAllViews(doc)
	}, [doc, views, viewOrder])
}

/**
 * Get a single view by ID
 */
export function useView(doc: YPrezilloDocument, viewId: ViewId | null): ViewNode | null {
	const views = useY(doc.v)

	return React.useMemo(() => {
		if (!views || !viewId) return null
		return getView(doc, viewId) || null
	}, [doc, views, viewId])
}

/**
 * Get view IDs in presentation order
 */
export function useViewIds(doc: YPrezilloDocument): ViewId[] {
	const viewOrder = useY(doc.vo)

	return React.useMemo(() => {
		if (!viewOrder) return []
		return viewOrder.map((id) => toViewId(id))
	}, [viewOrder])
}

// vim: ts=4
