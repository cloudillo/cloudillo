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
 * Prototype-based inheritance operations for objects
 *
 * Objects can have a `proto` field pointing to a prototype object.
 * This enables single-level inheritance where instances inherit from prototypes.
 *
 * - No chaining: Only one level of inheritance (instance → prototype)
 * - When duplicating an instance: Copy proto reference + all local overrides
 * - Local fields override prototype fields
 */

import * as Y from 'yjs'
import type { YPrezilloDocument, StoredObject } from './stored-types'
import type { PrezilloObject } from './runtime-types'
import type { ObjectId, ViewId, ContainerId } from './ids'
import { toObjectId, toViewId, toContainerId, toStyleId } from './ids'
import { expandObject, expandShapeStyle, expandTextStyle } from './type-converters'

/**
 * Resolve an object with prototype inheritance (single level)
 * If the object has a prototype, merges prototype values with local overrides
 */
export function resolveObject(
	doc: YPrezilloDocument,
	objectId: ObjectId
): PrezilloObject | undefined {
	const stored = doc.o.get(objectId)
	if (!stored) return undefined

	// No prototype - return expanded object directly
	if (!stored.proto) {
		// Check for required fields (prototype objects may lack these)
		if (!stored.xy || !stored.wh) {
			// This is likely a prototype object - skip it
			return undefined
		}
		return expandObject(objectId, stored)
	}

	// Has prototype - get prototype and merge (single level, no recursion)
	const protoStored = doc.o.get(stored.proto)
	if (!protoStored) {
		// Prototype not found - can only expand if instance has required fields
		if (!stored.xy || !stored.wh) {
			console.warn(
				`Object ${objectId} has missing prototype ${stored.proto} and lacks required fields`
			)
			return undefined
		}
		return expandObject(objectId, stored)
	}

	// Merge: prototype values as base, local values as overrides
	return mergeObjectWithPrototype(objectId, stored, protoStored)
}

/**
 * Merge an instance object with its prototype
 * Local fields override prototype fields
 */
function mergeObjectWithPrototype(
	objectId: string,
	instance: StoredObject,
	prototype: StoredObject
): PrezilloObject {
	// Start with expanded prototype
	const base = expandObject(objectId, prototype)

	// Override with locally defined fields from instance
	// A field is "locally defined" if it exists in the stored instance

	// Position
	if (instance.xy !== undefined) {
		base.x = instance.xy[0]
		base.y = instance.xy[1]
	}

	// Size
	if (instance.wh !== undefined) {
		base.width = instance.wh[0]
		base.height = instance.wh[1]
	}

	// Transform
	if (instance.r !== undefined) base.rotation = instance.r
	if (instance.pv !== undefined) {
		base.pivotX = instance.pv[0]
		base.pivotY = instance.pv[1]
	}

	// Appearance
	if (instance.o !== undefined) base.opacity = instance.o
	if (instance.v !== undefined) base.visible = instance.v !== false
	if (instance.k !== undefined) base.locked = instance.k === true

	// Metadata
	if (instance.n !== undefined) base.name = instance.n

	// Page/parent association (these should always be from instance)
	if (instance.vi !== undefined) base.pageId = toObjectId(instance.vi) as unknown as ViewId
	if (instance.p !== undefined) base.parentId = toObjectId(instance.p) as unknown as ContainerId

	// Style references - instance can have its own style refs that override prototype's
	// Extract style fields directly without calling expandObject (which requires xy/wh)
	if (instance.si !== undefined || instance.s !== undefined) {
		base.shapeStyleId = instance.si ? toStyleId(instance.si) : undefined
		base.style = expandShapeStyle(instance.s)
	}

	if (instance.ti !== undefined || instance.ts !== undefined) {
		base.textStyleId = instance.ti ? toStyleId(instance.ti) : undefined
		base.textStyle = expandTextStyle(instance.ts)
	}

	// Type-specific fields - use instance values if present
	// This requires checking each type and their specific fields
	mergeTypeSpecificFields(base, instance, prototype)

	// Set the prototype reference in the result
	base.prototypeId = toObjectId(instance.proto!)

	// Use instance's own ID
	base.id = toObjectId(objectId)

	return base
}

/**
 * Merge type-specific fields from instance over prototype
 */
function mergeTypeSpecificFields(
	result: PrezilloObject,
	instance: StoredObject,
	_prototype: StoredObject
): void {
	// Handle type-specific fields based on object type
	switch (instance.t) {
		case 'R': // Rect
			if ('cr' in instance && instance.cr !== undefined) {
				;(result as any).cornerRadius = instance.cr
			}
			break

		case 'T': // Text
			if ('tx' in instance && instance.tx !== undefined) {
				;(result as any).text = instance.tx
			}
			if ('mh' in instance && instance.mh !== undefined) {
				;(result as any).minHeight = instance.mh
			}
			break

		case 'Q': // QR Code
			if ('url' in instance && instance.url !== undefined) {
				;(result as any).url = instance.url
			}
			if ('ecl' in instance && instance.ecl !== undefined) {
				;(result as any).errorCorrection = instance.ecl
			}
			if ('fg' in instance && instance.fg !== undefined) {
				;(result as any).foreground = instance.fg
			}
			if ('bg' in instance && instance.bg !== undefined) {
				;(result as any).background = instance.bg
			}
			break

		// Add other type-specific handling as needed
		// For most types, the base fields are sufficient
	}
}

/**
 * Check if an object is an instance (has a prototype)
 */
export function isInstance(doc: YPrezilloDocument, objectId: ObjectId): boolean {
	const stored = doc.o.get(objectId)
	return stored?.proto !== undefined
}

// ============================================================================
// Prototype resolution helpers for stored objects
// These are used throughout the codebase to resolve inherited properties
// ============================================================================

/**
 * Get resolved xy coordinates for a stored object.
 * Returns object's own xy if present, otherwise resolves from prototype.
 * Returns null if neither object nor prototype have xy.
 */
export function getResolvedXy(
	doc: YPrezilloDocument,
	object: StoredObject
): [number, number] | null {
	if (object.xy) return object.xy
	if (object.proto) {
		const proto = doc.o.get(object.proto as ObjectId)
		if (proto?.xy) return proto.xy
	}
	return null
}

/**
 * Get resolved wh dimensions for a stored object.
 * Returns object's own wh if present, otherwise resolves from prototype.
 * Returns null if neither object nor prototype have wh.
 */
export function getResolvedWh(
	doc: YPrezilloDocument,
	object: StoredObject
): [number, number] | null {
	if (object.wh) return object.wh
	if (object.proto) {
		const proto = doc.o.get(object.proto as ObjectId)
		if (proto?.wh) return proto.wh
	}
	return null
}

/**
 * Get resolved bounds (xy, wh, r, pv) for a stored object.
 * Resolves each property from prototype if not locally defined.
 * Returns null if xy or wh cannot be resolved.
 */
export function getResolvedBounds(
	doc: YPrezilloDocument,
	object: StoredObject
): { xy: [number, number]; wh: [number, number]; r: number; pv: [number, number] } | null {
	const xy = getResolvedXy(doc, object)
	const wh = getResolvedWh(doc, object)
	if (!xy || !wh) return null

	let r = object.r ?? 0
	let pv: [number, number] = object.pv ?? [0.5, 0.5]

	if (object.proto) {
		const proto = doc.o.get(object.proto as ObjectId)
		if (proto) {
			if (object.r === undefined && proto.r !== undefined) r = proto.r
			if (object.pv === undefined && proto.pv !== undefined) pv = proto.pv
		}
	}

	return { xy, wh, r, pv }
}

/**
 * Get the prototype ID for an instance
 */
export function getPrototypeId(doc: YPrezilloDocument, objectId: ObjectId): ObjectId | undefined {
	const stored = doc.o.get(objectId)
	return stored?.proto ? toObjectId(stored.proto) : undefined
}

/**
 * Check if an object has any local overrides vs its prototype
 */
export function hasOverrides(doc: YPrezilloDocument, objectId: ObjectId): boolean {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return false

	// Check if any field other than proto, t (type), vi (viewId), and p (parentId) is set
	const overrideableFields = [
		'xy',
		'wh',
		'r',
		'pv',
		'o',
		'v',
		'k',
		'n',
		'si',
		'ti',
		's',
		'ts',
		// Type-specific fields
		'cr',
		'tx',
		'mh',
		'url',
		'ecl',
		'fg',
		'bg',
		'fid',
		'pts',
		'd',
		'tid'
	]

	return overrideableFields.some((field) => (stored as any)[field] !== undefined)
}

/**
 * Get which properties are overridden locally
 */
export function getOverriddenProperties(doc: YPrezilloDocument, objectId: ObjectId): string[] {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return []

	const overridden: string[] = []

	// Map stored field names to runtime property names
	const fieldMap: Record<string, string> = {
		xy: 'position',
		wh: 'size',
		r: 'rotation',
		pv: 'pivot',
		o: 'opacity',
		v: 'visible',
		k: 'locked',
		n: 'name',
		si: 'shapeStyleId',
		ti: 'textStyleId',
		s: 'style',
		ts: 'textStyle',
		cr: 'cornerRadius',
		tx: 'text',
		mh: 'minHeight',
		url: 'url',
		ecl: 'errorCorrection',
		fg: 'foreground',
		bg: 'background'
	}

	for (const [storedField, runtimeField] of Object.entries(fieldMap)) {
		if ((stored as any)[storedField] !== undefined) {
			overridden.push(runtimeField)
		}
	}

	return overridden
}

/**
 * Get all instances of a prototype object
 */
export function getInstancesOfPrototype(doc: YPrezilloDocument, prototypeId: ObjectId): ObjectId[] {
	const instances: ObjectId[] = []
	doc.o.forEach((obj, id) => {
		if (obj.proto === prototypeId) {
			instances.push(toObjectId(id))
		}
	})
	return instances
}

/**
 * Check if an object is a prototype (has instances referencing it)
 */
export function isPrototype(doc: YPrezilloDocument, objectId: ObjectId): boolean {
	return getInstancesOfPrototype(doc, objectId).length > 0
}

// ============================================================================
// Property Group Operations for Lock/Unlock UI
// ============================================================================

/**
 * Property groups for lock/unlock UI in property panel
 */
export type PropertyGroup =
	| 'position'
	| 'size'
	| 'rotation'
	| 'opacity'
	| 'shapeStyle' // Combined fill + stroke
	| 'textStyle'
	| 'cornerRadius'
	| 'qrUrl'
	| 'qrColors'
	| 'qrErrorCorrection'

/**
 * Mapping from property groups to stored field names
 */
const propertyGroupFields: Record<PropertyGroup, string[]> = {
	position: ['xy'],
	size: ['wh'],
	rotation: ['r'],
	opacity: ['o'],
	shapeStyle: ['si', 's'], // Shape style contains fill + stroke
	textStyle: ['ti', 'ts'],
	cornerRadius: ['cr'],
	qrUrl: ['url'],
	qrColors: ['fg', 'bg'],
	qrErrorCorrection: ['ecl']
}

/**
 * Check if a property group is overridden (has local values instead of inheriting from prototype)
 * Returns false if object is not an instance
 */
export function isPropertyGroupOverridden(
	doc: YPrezilloDocument,
	objectId: ObjectId,
	group: PropertyGroup
): boolean {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return false // Not an instance

	const fields = propertyGroupFields[group]
	return fields.some((field) => (stored as any)[field] !== undefined)
}

/**
 * Check if a property group is locked (not overridden, inheriting from prototype)
 * Returns false if object is not an instance (non-instances are always "unlocked")
 */
export function isPropertyGroupLocked(
	doc: YPrezilloDocument,
	objectId: ObjectId,
	group: PropertyGroup
): boolean {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return false // Not an instance, always unlocked

	return !isPropertyGroupOverridden(doc, objectId, group)
}

/**
 * Unlock a property group by copying the prototype value to the instance
 * This makes the property editable (creates a local override with current value)
 */
export function unlockPropertyGroup(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	group: PropertyGroup
): void {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return // Not an instance

	const protoStored = doc.o.get(stored.proto)
	if (!protoStored) return // Prototype not found

	yDoc.transact(() => {
		const obj = doc.o.get(objectId)
		if (!obj) return

		const updated = { ...obj }
		const fields = propertyGroupFields[group]

		// Copy each field from prototype to instance (creating override)
		for (const field of fields) {
			const protoValue = (protoStored as any)[field]
			if (protoValue !== undefined) {
				// Deep copy arrays to avoid shared references
				;(updated as any)[field] = Array.isArray(protoValue)
					? [...protoValue]
					: typeof protoValue === 'object' && protoValue !== null
						? { ...protoValue }
						: protoValue
			}
		}

		doc.o.set(objectId, updated as StoredObject)
	}, yDoc.clientID)
}

/**
 * Reset (lock) a property group by removing the local override
 * The property will then inherit from the prototype
 */
export function resetPropertyGroup(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	group: PropertyGroup
): void {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return // Not an instance

	yDoc.transact(() => {
		const obj = doc.o.get(objectId)
		if (!obj) return

		const updated = { ...obj }
		const fields = propertyGroupFields[group]

		// Remove each field (so it inherits from prototype)
		for (const field of fields) {
			delete (updated as any)[field]
		}

		doc.o.set(objectId, updated as StoredObject)
	}, yDoc.clientID)
}

// ============================================================================
// Per-Field Text Style Operations
// For granular lock/unlock/reset of individual text style properties
// ============================================================================

/** Text style field names */
export type TextStyleField =
	| 'ff'
	| 'fs'
	| 'fw'
	| 'fi'
	| 'td'
	| 'fc'
	| 'ta'
	| 'va'
	| 'lh'
	| 'ls'
	| 'lb'

/**
 * Check if a specific text style field is overridden (has local value)
 * Returns false if object is not an instance
 */
export function isTextStyleFieldOverridden(
	doc: YPrezilloDocument,
	objectId: ObjectId,
	field: TextStyleField
): boolean {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return false
	return stored.ts?.[field] !== undefined
}

/**
 * Unlock a text style field by copying the prototype's value to the instance
 * This creates a local override with the current inherited value
 */
export function unlockTextStyleField(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	field: TextStyleField
): void {
	const stored = doc.o.get(objectId)
	if (!stored?.proto) return

	const protoStored = doc.o.get(stored.proto)
	if (!protoStored) return

	yDoc.transact(() => {
		const obj = doc.o.get(objectId)
		if (!obj) return

		// Get the prototype's value for this field
		const protoValue = protoStored.ts?.[field]
		if (protoValue === undefined) return

		// Copy to instance
		const newTs = { ...(obj.ts || {}), [field]: protoValue }
		doc.o.set(objectId, { ...obj, ts: newTs } as StoredObject)
	}, yDoc.clientID)
}

/**
 * Reset a text style field to inherit from prototype
 * Removes the local override for this field
 */
export function resetTextStyleField(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: ObjectId,
	field: TextStyleField
): void {
	const stored = doc.o.get(objectId)
	if (!stored?.proto || !stored.ts) return

	yDoc.transact(() => {
		const obj = doc.o.get(objectId)
		if (!obj?.ts) return

		const newTs = { ...obj.ts }
		delete newTs[field]

		// If no fields left, remove ts entirely
		const hasProps = Object.keys(newTs).length > 0
		doc.o.set(objectId, { ...obj, ts: hasProps ? newTs : undefined } as StoredObject)
	}, yDoc.clientID)
}

// vim: ts=4
