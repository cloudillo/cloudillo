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

import type { YPrezilloDocument, ObjectId, PrezilloObject } from '../../crdt'
import { getObject } from '../../crdt'
import { TransformSection } from './TransformSection'
import { StyleSection } from './StyleSection'
import { TextStyleSection } from './TextStyleSection'
import { ShapeSection } from './ShapeSection'
import type { PropertyPreview } from './PrezilloPropertiesPanel'

export interface PropertyEditorProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	selectedIds: Set<ObjectId>
	onPreview?: (preview: PropertyPreview | null) => void
}

export function PropertyEditor({ doc, yDoc, selectedIds, onPreview }: PropertyEditorProps) {
	// Subscribe to object changes - useY returns a version number that changes on updates
	useY(doc.o)

	// Get selected object if single selection
	// No useMemo - we want to recalculate on every render triggered by useY
	let selectedObject: PrezilloObject | null = null
	if (selectedIds.size === 1) {
		const id = Array.from(selectedIds)[0]
		selectedObject = getObject(doc, id) ?? null
	}

	// No selection
	if (selectedIds.size === 0) {
		return (
			<div style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', padding: '16px 0' }}>
				No selection
			</div>
		)
	}

	// Multiple selection
	if (selectedIds.size > 1) {
		return (
			<div style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', padding: '16px 0' }}>
				{selectedIds.size} objects selected
			</div>
		)
	}

	// Single selection but object not found
	if (!selectedObject) {
		return (
			<div style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', padding: '16px 0' }}>
				Object not found
			</div>
		)
	}

	// Check if object is a text type
	const isTextObject = selectedObject.type === 'text' || selectedObject.type === 'textbox'

	// Check if object is a rect (has corner radius)
	const isRectObject = selectedObject.type === 'rect'

	return (
		<div className="c-vbox g-2">
			<TransformSection doc={doc} yDoc={yDoc} object={selectedObject} onPreview={onPreview} />

			<StyleSection doc={doc} yDoc={yDoc} object={selectedObject} />

			{isTextObject && <TextStyleSection doc={doc} yDoc={yDoc} object={selectedObject} />}

			{isRectObject && <ShapeSection doc={doc} yDoc={yDoc} object={selectedObject} />}
		</div>
	)
}

// vim: ts=4
