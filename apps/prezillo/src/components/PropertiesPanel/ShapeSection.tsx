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
import { PropertySection, PropertyField, NumberInput } from '@cloudillo/react'

import type { YPrezilloDocument, PrezilloObject, ObjectId, RectObject } from '../../crdt'
import { updateObject } from '../../crdt'

export interface ShapeSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function ShapeSection({ doc, yDoc, object }: ShapeSectionProps) {
	// Only show for rect objects
	if (object.type !== 'rect') return null

	const rectObject = object as RectObject
	const cornerRadius =
		typeof rectObject.cornerRadius === 'number'
			? rectObject.cornerRadius
			: Array.isArray(rectObject.cornerRadius)
				? rectObject.cornerRadius[0]
				: 0

	const handleCornerRadiusChange = React.useCallback(
		(value: number) => {
			updateObject(yDoc, doc, object.id as ObjectId, {
				cornerRadius: Math.max(0, value)
			})
		},
		[yDoc, doc, object.id]
	)

	return (
		<PropertySection title="Shape" defaultExpanded>
			<PropertyField label="Radius" labelWidth={45}>
				<NumberInput
					value={cornerRadius}
					onChange={handleCornerRadiusChange}
					min={0}
					step={1}
					style={{ width: '100%' }}
				/>
			</PropertyField>
		</PropertySection>
	)
}

// vim: ts=4
