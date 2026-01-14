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
import { useY } from 'react-yjs'

import type {
	YPrezilloDocument,
	ObjectId,
	ViewId,
	PrezilloObject,
	TableGridObject
} from '../../crdt'
import { getObject } from '../../crdt'
import { TransformSection } from './TransformSection'
import { StyleSection } from './StyleSection'
import { TextStyleSection } from './TextStyleSection'
import { ShapeSection } from './ShapeSection'
import { QRCodeSection } from './QRCodeSection'
import { TableGridSection } from './TableGridSection'
import { ViewPropertiesPanel } from './ViewPropertiesPanel'
import type { PropertyPreview } from './PrezilloPropertiesPanel'

export interface PropertyEditorProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	selectedIds: Set<ObjectId>
	activeViewId?: ViewId
	/** True when view background was explicitly clicked */
	isViewFocused?: boolean
	onPreview?: (preview: PropertyPreview | null) => void
}

export function PropertyEditor({
	doc,
	yDoc,
	selectedIds,
	activeViewId,
	isViewFocused,
	onPreview
}: PropertyEditorProps) {
	// Subscribe to object changes - useY returns a version number that changes on updates
	useY(doc.o)

	// Get selected object if single selection
	// No useMemo - we want to recalculate on every render triggered by useY
	let selectedObject: PrezilloObject | null = null
	if (selectedIds.size === 1) {
		const id = Array.from(selectedIds)[0]
		selectedObject = getObject(doc, id) ?? null
	}

	// Show view properties when view background was explicitly clicked
	const showViewProperties = isViewFocused && activeViewId

	// Calculate page number for display
	const viewIndex = React.useMemo(() => {
		if (!activeViewId) return 0
		const viewOrder = doc.vo?.toArray() ?? []
		const idx = viewOrder.indexOf(activeViewId)
		return idx >= 0 ? idx + 1 : 0
	}, [doc.vo, activeViewId])

	if (showViewProperties && activeViewId) {
		return (
			<div className="c-vbox">
				<div className="c-property-editor-header">Page {viewIndex}</div>
				<ViewPropertiesPanel doc={doc} yDoc={yDoc} activeViewId={activeViewId} />
			</div>
		)
	}

	// No selection and no view to show
	if (selectedIds.size === 0) {
		return <div className="c-empty-message">No selection</div>
	}

	// Multiple selection
	if (selectedIds.size > 1) {
		return <div className="c-empty-message">{selectedIds.size} objects selected</div>
	}

	// Single selection but object not found
	if (!selectedObject) {
		return <div className="c-empty-message">Object not found</div>
	}

	// Check if object is a text type
	const isTextObject = selectedObject.type === 'text'

	// Check if object is a rect (has corner radius)
	const isRectObject = selectedObject.type === 'rect'

	// Check if object is a QR code
	const isQrCodeObject = selectedObject.type === 'qrcode'

	// Check if object is a table grid
	const isTableGridObject = selectedObject.type === 'tablegrid'

	return (
		<div className="c-vbox g-2">
			<TransformSection doc={doc} yDoc={yDoc} object={selectedObject} onPreview={onPreview} />

			{!isQrCodeObject && <StyleSection doc={doc} yDoc={yDoc} object={selectedObject} />}

			{isTextObject && <TextStyleSection doc={doc} yDoc={yDoc} object={selectedObject} />}

			{isRectObject && <ShapeSection doc={doc} yDoc={yDoc} object={selectedObject} />}

			{isQrCodeObject && <QRCodeSection doc={doc} yDoc={yDoc} object={selectedObject} />}

			{isTableGridObject && (
				<TableGridSection
					doc={doc}
					yDoc={yDoc}
					object={selectedObject as TableGridObject}
				/>
			)}
		</div>
	)
}

// vim: ts=4
