// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type * as Y from 'yjs'
import { PropertySection, PropertyField, NumberInput } from '@cloudillo/react'

import type { YPrezilloDocument, PrezilloObject, ObjectId, RectObject } from '../../crdt'
import {
	updateObject,
	isInstance,
	isPropertyGroupLocked,
	unlockPropertyGroup,
	resetPropertyGroup
} from '../../crdt'
import { PropertyLockButton } from './PropertyLockButton'

export interface ShapeSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	object: PrezilloObject
}

export function ShapeSection({ doc, yDoc, object }: ShapeSectionProps) {
	const objectId = object.id as ObjectId

	// Check if this object is an instance of a template prototype
	const objectIsInstance = isInstance(doc, objectId)

	// Check lock state for corner radius
	const cornerRadiusLocked = isPropertyGroupLocked(doc, objectId, 'cornerRadius')

	// Unlock/reset handlers
	const handleUnlockCornerRadius = React.useCallback(() => {
		unlockPropertyGroup(yDoc, doc, objectId, 'cornerRadius')
	}, [yDoc, doc, objectId])

	const handleResetCornerRadius = React.useCallback(() => {
		resetPropertyGroup(yDoc, doc, objectId, 'cornerRadius')
	}, [yDoc, doc, objectId])

	// Determine if editing is disabled
	const isDisabled = objectIsInstance && cornerRadiusLocked

	const rectObject = object as RectObject
	const cornerRadius =
		typeof rectObject.cornerRadius === 'number'
			? rectObject.cornerRadius
			: Array.isArray(rectObject.cornerRadius)
				? rectObject.cornerRadius[0]
				: 0

	const handleCornerRadiusChange = React.useCallback(
		(value: number) => {
			if (isDisabled) return
			updateObject(yDoc, doc, objectId, {
				cornerRadius: Math.max(0, value)
			})
		},
		[yDoc, doc, objectId, isDisabled]
	)

	// Only show for rect objects
	if (object.type !== 'rect') return null

	return (
		<PropertySection title="Shape" defaultExpanded>
			<div className={isDisabled ? 'c-property-field--locked' : ''}>
				<PropertyField label="Radius" labelWidth={45}>
					<div className="c-hbox ai-center g-1 f-1">
						<NumberInput
							value={cornerRadius}
							onChange={handleCornerRadiusChange}
							min={0}
							step={1}
							className="c-input--full"
							disabled={isDisabled}
						/>
						<PropertyLockButton
							isInstance={objectIsInstance}
							isLocked={cornerRadiusLocked}
							onUnlock={handleUnlockCornerRadius}
							onReset={handleResetCornerRadius}
						/>
					</div>
				</PropertyField>
			</div>
		</PropertySection>
	)
}

// vim: ts=4
