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
 * Hook for managing lockable property groups on template instances
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { YPrezilloDocument, ObjectId, PropertyGroup } from '../crdt'
import { isInstance, isPropertyGroupLocked, unlockPropertyGroup, resetPropertyGroup } from '../crdt'

export interface UseLockablePropertyResult {
	/** Whether the object is a template instance */
	isInstance: boolean
	/** Whether the property group is locked (inheriting from prototype) */
	isLocked: boolean
	/** Whether inputs should be disabled (isInstance && isLocked) */
	isDisabled: boolean
	/** Callback to unlock the property group (copy prototype value to instance) */
	handleUnlock: () => void
	/** Callback to reset the property group (clear override, return to inherited) */
	handleReset: () => void
}

/**
 * Hook for managing lockable property groups on template instances.
 *
 * Provides the lock state, disabled state, and handlers for unlocking/resetting
 * a property group. This eliminates repetitive callback definitions across
 * PropertiesPanel sections.
 *
 * @param yDoc - Yjs document for transactions
 * @param doc - Prezillo document
 * @param objectId - ID of the object being edited
 * @param propertyGroup - Name of the property group (e.g., 'position', 'size', 'fill')
 * @returns Lock state and handlers
 *
 * @example
 * ```tsx
 * const { isInstance, isLocked, isDisabled, handleUnlock, handleReset } =
 *   useLockableProperty(yDoc, doc, objectId, 'position')
 *
 * return (
 *   <>
 *     <PropertyLockButton
 *       isInstance={isInstance}
 *       isLocked={isLocked}
 *       onUnlock={handleUnlock}
 *       onReset={handleReset}
 *     />
 *     <NumberInput disabled={isDisabled} ... />
 *   </>
 * )
 * ```
 */
export function useLockableProperty(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	propertyGroup: PropertyGroup
): UseLockablePropertyResult {
	// Check if this object is a template instance
	const objectIsInstance = isInstance(doc, objectId)

	// Check if this property group is locked
	const isLocked = isPropertyGroupLocked(doc, objectId, propertyGroup)

	// Determine if inputs should be disabled
	const isDisabled = objectIsInstance && isLocked

	// Unlock handler - copy prototype value to instance
	const handleUnlock = React.useCallback(() => {
		unlockPropertyGroup(yDoc, doc, objectId, propertyGroup)
	}, [yDoc, doc, objectId, propertyGroup])

	// Reset handler - clear override, return to inherited
	const handleReset = React.useCallback(() => {
		resetPropertyGroup(yDoc, doc, objectId, propertyGroup)
	}, [yDoc, doc, objectId, propertyGroup])

	return {
		isInstance: objectIsInstance,
		isLocked,
		isDisabled,
		handleUnlock,
		handleReset
	}
}

// vim: ts=4
