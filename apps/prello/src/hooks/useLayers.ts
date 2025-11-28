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
 * Hook for getting document layers
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { YPrelloDocument, ContainerNode, ContainerId } from '../crdt'
import { getLayers, getLayerIds } from '../crdt'

/**
 * Get all layers in the document
 */
export function useLayers(doc: YPrelloDocument): ContainerNode[] {
	const containers = useY(doc.c)
	const rootChildren = useY(doc.r)

	return React.useMemo(() => {
		if (!containers || !rootChildren) return []
		return getLayers(doc)
	}, [doc, containers, rootChildren])
}

/**
 * Get layer IDs
 */
export function useLayerIds(doc: YPrelloDocument): ContainerId[] {
	const containers = useY(doc.c)
	const rootChildren = useY(doc.r)

	return React.useMemo(() => {
		if (!containers || !rootChildren) return []
		return getLayerIds(doc)
	}, [doc, containers, rootChildren])
}

// vim: ts=4
