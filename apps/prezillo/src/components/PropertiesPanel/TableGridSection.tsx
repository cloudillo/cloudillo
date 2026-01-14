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
 * TableGridSection - Properties panel section for table grid configuration
 */

import * as React from 'react'
import * as Y from 'yjs'
import { PropertySection, PropertyField, NumberInput } from '@cloudillo/react'

import type { YPrezilloDocument, TableGridObject, ObjectId } from '../../crdt'
import { updateObject } from '../../crdt'

export interface TableGridSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: TableGridObject
}

export function TableGridSection({ doc, yDoc, object }: TableGridSectionProps) {
	const objectId = object.id as ObjectId

	const handleColsChange = React.useCallback(
		(cols: number) => {
			const newCols = Math.max(1, Math.min(20, Math.round(cols)))
			updateObject(yDoc, doc, objectId, { cols: newCols })
		},
		[yDoc, doc, objectId]
	)

	const handleRowsChange = React.useCallback(
		(rows: number) => {
			const newRows = Math.max(1, Math.min(20, Math.round(rows)))
			updateObject(yDoc, doc, objectId, { rows: newRows })
		},
		[yDoc, doc, objectId]
	)

	return (
		<PropertySection title="Grid" defaultExpanded>
			<PropertyField label="Columns" labelWidth={60}>
				<NumberInput
					value={object.cols}
					onChange={handleColsChange}
					min={1}
					max={20}
					step={1}
				/>
			</PropertyField>
			<PropertyField label="Rows" labelWidth={60}>
				<NumberInput
					value={object.rows}
					onChange={handleRowsChange}
					min={1}
					max={20}
					step={1}
				/>
			</PropertyField>
		</PropertySection>
	)
}

// vim: ts=4
