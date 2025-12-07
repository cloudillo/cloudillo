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

import * as React from 'react'
import * as Y from 'yjs'
import { PropertyPanel } from '@cloudillo/react'

import type { YPrezilloDocument, ObjectId, ViewId, ContainerId } from '../../crdt'
import { LayerBrowser } from './LayerBrowser'
import { PropertyEditor } from './PropertyEditor'

export interface PropertyPreview {
	objectId: ObjectId
	opacity?: number
}

export interface PrezilloPropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	selectedIds: Set<ObjectId>
	onSelectObject: (id: ObjectId, addToSelection?: boolean) => void
	activeViewId: ViewId | null
	/** Callback for live preview during scrubbing */
	onPreview?: (preview: PropertyPreview | null) => void
	/** Currently selected container (layer) ID */
	selectedContainerId?: ContainerId | null
	/** Callback when a container is selected */
	onSelectContainer?: (id: ContainerId | null) => void
}

export function PrezilloPropertiesPanel({
	doc,
	yDoc,
	selectedIds,
	onSelectObject,
	activeViewId,
	onPreview,
	selectedContainerId,
	onSelectContainer
}: PrezilloPropertiesPanelProps) {
	return (
		<PropertyPanel width={280}>
			{/* Layer Browser - top section */}
			<div className="c-panel-section c-panel-section--layers">
				<h4 className="c-panel-heading m-0">Layers</h4>
				<div className="p-2 pt-0">
					<LayerBrowser
						doc={doc}
						yDoc={yDoc}
						selectedIds={selectedIds}
						onSelectObject={onSelectObject}
						activeViewId={activeViewId}
						selectedContainerId={selectedContainerId}
						onSelectContainer={onSelectContainer}
					/>
				</div>
			</div>

			{/* Property Editor - bottom section */}
			<div className="c-panel-section flex-fill">
				<h4 className="c-panel-heading m-0">Properties</h4>
				<div className="p-2 pt-0">
					<PropertyEditor
						doc={doc}
						yDoc={yDoc}
						selectedIds={selectedIds}
						onPreview={onPreview}
					/>
				</div>
			</div>
		</PropertyPanel>
	)
}

// vim: ts=4
