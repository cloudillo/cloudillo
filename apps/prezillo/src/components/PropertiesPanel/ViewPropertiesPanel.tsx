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
 * Properties panel for view/slide editing (shown when no objects are selected)
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'

import type { YPrezilloDocument, ViewId, ViewNode } from '../../crdt'
import { getView } from '../../crdt'
import { BackgroundSection } from './BackgroundSection'

export interface ViewPropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	activeViewId: ViewId
}

export function ViewPropertiesPanel({ doc, yDoc, activeViewId }: ViewPropertiesPanelProps) {
	// Subscribe to view changes
	useY(doc.v)

	const view = getView(doc, activeViewId)

	if (!view) {
		return <div className="c-empty-message">View not found</div>
	}

	return (
		<div className="c-vbox g-2">
			<BackgroundSection doc={doc} yDoc={yDoc} view={view} />
			{/* Future: TransitionSection, NotesSection, etc. */}
		</div>
	)
}

// vim: ts=4
