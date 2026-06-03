// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * TableGridSection - Properties panel section for table grid configuration
 */

import { NumberInput, PropertyField, PropertySection } from '@cloudillo/react'
import * as React from 'react'
import type * as Y from 'yjs'

import type { ObjectId, TableGridObject, YPrezilloDocument } from '../../crdt'
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
