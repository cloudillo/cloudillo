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
 * Template operations for page templates
 *
 * Templates define:
 * - Background styles (solid, gradient, image)
 * - Snap guides (horizontal/vertical alignment helpers)
 * - Prototype objects (tracked separately in tpo map)
 *
 * When a template is applied to a view:
 * - View inherits background from template (can override)
 * - Instance objects are created for each prototype (via proto reference)
 */

import * as Y from 'yjs'
import type {
	YPrezilloDocument,
	StoredTemplate,
	StoredSnapGuide,
	StoredObject,
	StoredView,
	ChildRef,
	StoredBackgroundGradient
} from './stored-types'
import type { Template, SnapGuide, PrezilloObject, ViewNode } from './runtime-types'
import type { TemplateId, ViewId, ObjectId, ContainerId } from './ids'
import { toTemplateId, generateTemplateId, toObjectId, generateObjectId, toViewId } from './ids'
import { expandObject } from './type-converters'
import type { Gradient } from '@cloudillo/canvas-tools'

// ============================================================================
// Type Converters (Template-specific)
// ============================================================================

/**
 * Expand stored snap guide to runtime format
 */
function expandSnapGuide(stored: StoredSnapGuide): SnapGuide {
	return {
		direction: stored.d === 'h' ? 'horizontal' : 'vertical',
		position: stored.p,
		absolute: stored.a
	}
}

/**
 * Compact runtime snap guide to stored format
 */
function compactSnapGuide(guide: SnapGuide): StoredSnapGuide {
	const stored: StoredSnapGuide = {
		d: guide.direction === 'horizontal' ? 'h' : 'v',
		p: guide.position
	}
	if (guide.absolute) stored.a = true
	return stored
}

/**
 * Expand stored gradient to runtime format
 */
function expandGradient(stored?: StoredBackgroundGradient): Gradient | undefined {
	if (!stored || !stored.gt) return undefined

	if (stored.gt === 'l') {
		return {
			type: 'linear',
			angle: stored.ga ?? 0,
			stops: (stored.gs || []).map(([color, position]) => ({ color, position }))
		}
	} else {
		return {
			type: 'radial',
			centerX: stored.gx ?? 0.5,
			centerY: stored.gy ?? 0.5,
			stops: (stored.gs || []).map(([color, position]) => ({ color, position }))
		}
	}
}

/**
 * Compact runtime gradient to stored format
 */
function compactGradient(gradient?: Gradient): StoredBackgroundGradient | undefined {
	if (!gradient) return undefined

	const stored: StoredBackgroundGradient = {
		gt: gradient.type === 'linear' ? 'l' : 'r',
		gs: (gradient.stops || []).map((s) => [s.color, s.position])
	}

	if (gradient.type === 'linear') {
		if (gradient.angle !== undefined && gradient.angle !== 0) {
			stored.ga = gradient.angle
		}
	} else {
		if (gradient.centerX !== undefined && gradient.centerX !== 0.5) {
			stored.gx = gradient.centerX
		}
		if (gradient.centerY !== undefined && gradient.centerY !== 0.5) {
			stored.gy = gradient.centerY
		}
	}

	return stored
}

/**
 * Expand stored template to runtime format
 */
export function expandTemplate(templateId: string, stored: StoredTemplate): Template {
	return {
		id: toTemplateId(templateId),
		name: stored.n,
		width: stored.w,
		height: stored.h,
		backgroundColor: stored.bc,
		backgroundGradient: expandGradient(stored.bg),
		backgroundImage: stored.bi,
		backgroundFit: stored.bf,
		snapGuides: (stored.sg || []).map(expandSnapGuide)
	}
}

// ============================================================================
// Template CRUD Operations
// ============================================================================

export interface CreateTemplateOptions {
	name: string
	width?: number
	height?: number
	backgroundColor?: string
	backgroundGradient?: Gradient
	backgroundImage?: string
	backgroundFit?: 'contain' | 'cover' | 'fill' | 'tile'
	snapGuides?: SnapGuide[]
}

/**
 * Create a new template
 */
export function createTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	options: CreateTemplateOptions
): TemplateId {
	const templateId = generateTemplateId()

	yDoc.transact(() => {
		const stored: StoredTemplate = {
			n: options.name,
			w: options.width ?? 1920,
			h: options.height ?? 1080
		}

		if (options.backgroundColor) stored.bc = options.backgroundColor
		if (options.backgroundGradient) stored.bg = compactGradient(options.backgroundGradient)
		if (options.backgroundImage) stored.bi = options.backgroundImage
		if (options.backgroundFit) stored.bf = options.backgroundFit
		if (options.snapGuides && options.snapGuides.length > 0) {
			stored.sg = options.snapGuides.map(compactSnapGuide)
		}

		doc.tpl.set(templateId, stored)

		// Initialize empty prototype objects array
		const protoArray = new Y.Array<string>()
		doc.tpo.set(templateId, protoArray)
	}, yDoc.clientID)

	return templateId
}

/**
 * Get a template by ID
 */
export function getTemplate(doc: YPrezilloDocument, templateId: TemplateId): Template | undefined {
	const stored = doc.tpl.get(templateId)
	if (!stored) return undefined
	return expandTemplate(templateId, stored)
}

/**
 * Get all templates
 */
export function getAllTemplates(doc: YPrezilloDocument): Template[] {
	const templates: Template[] = []
	doc.tpl.forEach((stored, id) => {
		templates.push(expandTemplate(id, stored))
	})
	return templates
}

export interface UpdateTemplateOptions {
	name?: string
	width?: number
	height?: number
	backgroundColor?: string | null
	backgroundGradient?: Gradient | null
	backgroundImage?: string | null
	backgroundFit?: 'contain' | 'cover' | 'fill' | 'tile' | null
}

/**
 * Update a template
 */
export function updateTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	updates: UpdateTemplateOptions
): void {
	const stored = doc.tpl.get(templateId)
	if (!stored) return

	yDoc.transact(() => {
		const updated = { ...stored }

		if (updates.name !== undefined) updated.n = updates.name
		if (updates.width !== undefined) updated.w = updates.width
		if (updates.height !== undefined) updated.h = updates.height

		// Handle nullable fields
		if (updates.backgroundColor === null) {
			delete updated.bc
		} else if (updates.backgroundColor !== undefined) {
			updated.bc = updates.backgroundColor
		}

		if (updates.backgroundGradient === null) {
			delete updated.bg
		} else if (updates.backgroundGradient !== undefined) {
			updated.bg = compactGradient(updates.backgroundGradient)
		}

		if (updates.backgroundImage === null) {
			delete updated.bi
		} else if (updates.backgroundImage !== undefined) {
			updated.bi = updates.backgroundImage
		}

		if (updates.backgroundFit === null) {
			delete updated.bf
		} else if (updates.backgroundFit !== undefined) {
			updated.bf = updates.backgroundFit
		}

		doc.tpl.set(templateId, updated)
	}, yDoc.clientID)
}

export interface DeleteTemplateOptions {
	/**
	 * What to do with views using this template
	 * - 'detach': Remove template reference, keep instances as regular objects
	 * - 'remove-instances': Remove template reference and delete all instance objects
	 * - 'keep-background': Remove template reference, copy background to view
	 */
	viewAction: 'detach' | 'remove-instances' | 'keep-background'
}

/**
 * Delete a template
 */
export function deleteTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	options: DeleteTemplateOptions
): void {
	const stored = doc.tpl.get(templateId)
	if (!stored) return

	const protoIds = doc.tpo.get(templateId)?.toArray() || []
	const viewsUsingTemplate = getViewsUsingTemplate(doc, templateId)

	yDoc.transact(() => {
		// Handle views using this template
		for (const viewId of viewsUsingTemplate) {
			const view = doc.v.get(viewId)
			if (!view) continue

			if (options.viewAction === 'keep-background') {
				// Copy template background to view before removing reference
				// Only copy if view doesn't already have its own value
				const updated: StoredView = { ...view }
				if (stored.bc && !view.backgroundColor) updated.backgroundColor = stored.bc
				if (stored.bg && !view.backgroundGradient) updated.backgroundGradient = stored.bg
				if (stored.bi && !view.backgroundImage) updated.backgroundImage = stored.bi
				if (stored.bf && !view.backgroundFit) updated.backgroundFit = stored.bf
				delete updated.tpl
				doc.v.set(viewId, updated)
			} else {
				// Just remove template reference
				const updated: StoredView = { ...view }
				delete updated.tpl
				doc.v.set(viewId, updated)
			}

			if (options.viewAction === 'remove-instances') {
				// Delete all instance objects that belong to this view and reference template prototypes
				doc.o.forEach((obj, objId) => {
					if (obj.vi === viewId && obj.proto && protoIds.includes(obj.proto)) {
						doc.o.delete(objId)
						// Also remove from children arrays if needed
						removeObjectFromChildren(doc, toObjectId(objId))
					}
				})
			} else {
				// Detach instances from prototype (copy all values locally)
				doc.o.forEach((obj, objId) => {
					if (obj.vi === viewId && obj.proto && protoIds.includes(obj.proto)) {
						const protoStored = doc.o.get(obj.proto)
						if (protoStored) {
							// Merge prototype into instance
							const merged = { ...protoStored, ...obj } as StoredObject
							delete merged.proto
							doc.o.set(objId, merged)
						} else {
							// Just remove proto reference
							const updated = { ...obj }
							delete updated.proto
							doc.o.set(objId, updated as StoredObject)
						}
					}
				})
			}
		}

		// Delete prototype objects
		for (const protoId of protoIds) {
			doc.o.delete(protoId)
			removeObjectFromChildren(doc, toObjectId(protoId))
		}

		// Delete prototype tracking array
		doc.tpo.delete(templateId)

		// Delete template
		doc.tpl.delete(templateId)
	}, yDoc.clientID)
}

/**
 * Duplicate a template
 */
export function duplicateTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	newName?: string
): TemplateId {
	const stored = doc.tpl.get(templateId)
	if (!stored) {
		throw new Error(`Template not found: ${templateId}`)
	}

	const newTemplateId = generateTemplateId()
	const protoIds = doc.tpo.get(templateId)?.toArray() || []

	yDoc.transact(() => {
		// Duplicate template definition
		const newStored: StoredTemplate = {
			...stored,
			n: newName ?? `${stored.n} (Copy)`
		}
		doc.tpl.set(newTemplateId, newStored)

		// Create new prototype objects array
		const newProtoArray = new Y.Array<string>()
		doc.tpo.set(newTemplateId, newProtoArray)

		// Duplicate prototype objects
		const protoIdMap = new Map<string, string>() // old → new

		for (const oldProtoId of protoIds) {
			const protoObj = doc.o.get(oldProtoId)
			if (!protoObj) continue

			const newProtoId = generateObjectId()
			protoIdMap.set(oldProtoId, newProtoId)

			// Copy the prototype object
			const newProtoObj = { ...protoObj }
			doc.o.set(newProtoId, newProtoObj as StoredObject)
			newProtoArray.push([newProtoId])
		}
	}, yDoc.clientID)

	return newTemplateId
}

// ============================================================================
// Template Object Management
// ============================================================================

/**
 * Add an existing object as a template prototype
 */
export function addObjectToTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	objectId: ObjectId
): void {
	const obj = doc.o.get(objectId)
	if (!obj) return

	const protoArray = doc.tpo.get(templateId)
	if (!protoArray) return

	yDoc.transact(() => {
		// Remove view association from prototype
		if (obj.vi) {
			const updated = { ...obj }
			delete updated.vi
			delete updated.proto
			doc.o.set(objectId, updated as StoredObject)
		}

		// Add to prototype tracking
		if (!protoArray.toArray().includes(objectId)) {
			protoArray.push([objectId])
		}

		// Create instances on all views using this template
		const viewsUsingTemplate = getViewsUsingTemplate(doc, templateId)
		const proto = doc.o.get(objectId)
		if (proto) {
			for (const vId of viewsUsingTemplate) {
				// Check if an instance already exists for this view/prototype combination
				let instanceExists = false
				doc.o.forEach((existingObj) => {
					if (existingObj.proto === objectId && existingObj.vi === vId) {
						instanceExists = true
					}
				})
				if (instanceExists) continue

				const instanceId = generateObjectId()
				// Instance only needs type, proto reference, and view - all else inherited
				const instance: Partial<StoredObject> = {
					t: proto.t,
					proto: objectId,
					vi: vId
				}
				doc.o.set(instanceId, instance as StoredObject)
				doc.r.push([[0, instanceId]])
			}
		}
	}, yDoc.clientID)
}

/**
 * Remove an object from template prototypes
 * Options:
 * - deleteObject: Delete the prototype object entirely
 * - deleteInstances: Delete all instances (use when moving prototype out of template)
 * - detachInstances: Detach all instances (merge prototype into them)
 */
export function removeObjectFromTemplate(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	objectId: ObjectId,
	options?: { deleteObject?: boolean; deleteInstances?: boolean; detachInstances?: boolean }
): void {
	const protoArray = doc.tpo.get(templateId)
	if (!protoArray) return

	yDoc.transact(() => {
		// Find and remove from array
		const index = protoArray.toArray().indexOf(objectId)
		if (index !== -1) {
			protoArray.delete(index, 1)
		}

		// Delete all instances if requested
		if (options?.deleteInstances) {
			const instancesToDelete: string[] = []
			doc.o.forEach((obj, objId) => {
				if (obj.proto === objectId) {
					instancesToDelete.push(objId)
				}
			})
			for (const instanceId of instancesToDelete) {
				doc.o.delete(instanceId)
				removeObjectFromChildren(doc, toObjectId(instanceId))
			}
		}
		// Detach all instances if requested (or if deleting prototype)
		else if (options?.detachInstances || options?.deleteObject) {
			const protoObj = doc.o.get(objectId)
			doc.o.forEach((obj, objId) => {
				if (obj.proto === objectId) {
					if (protoObj) {
						// Merge prototype properties into instance
						const merged = { ...protoObj, ...obj } as StoredObject
						delete merged.proto
						doc.o.set(objId, merged)
					} else {
						// Just remove proto reference
						const updated = { ...obj }
						delete updated.proto
						doc.o.set(objId, updated as StoredObject)
					}
				}
			})
		}

		if (options?.deleteObject) {
			// Delete the prototype object
			doc.o.delete(objectId)
			removeObjectFromChildren(doc, objectId)
		}
	}, yDoc.clientID)
}

/**
 * Get all prototype objects for a template
 */
export function getTemplatePrototypeObjects(
	doc: YPrezilloDocument,
	templateId: TemplateId
): PrezilloObject[] {
	const protoArray = doc.tpo.get(templateId)
	if (!protoArray) return []

	const objects: PrezilloObject[] = []
	for (const protoId of protoArray.toArray()) {
		const stored = doc.o.get(protoId)
		if (stored) {
			objects.push(expandObject(protoId, stored))
		}
	}
	return objects
}

/**
 * Get prototype object IDs for a template
 */
export function getTemplatePrototypeIds(
	doc: YPrezilloDocument,
	templateId: TemplateId
): ObjectId[] {
	const protoArray = doc.tpo.get(templateId)
	if (!protoArray) return []
	return protoArray.toArray().map(toObjectId)
}

// ============================================================================
// Apply Template to View
// ============================================================================

/**
 * Apply a template to a view
 * Creates instance objects for each prototype
 */
export function applyTemplateToView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	templateId: TemplateId
): void {
	const template = doc.tpl.get(templateId)
	if (!template) {
		throw new Error(`Template not found: ${templateId}`)
	}

	const view = doc.v.get(viewId)
	if (!view) {
		throw new Error(`View not found: ${viewId}`)
	}

	const protoIds = doc.tpo.get(templateId)?.toArray() || []

	yDoc.transact(() => {
		// Set template reference on view
		const updatedView: StoredView = { ...view, tpl: templateId }
		// Clear background fields (template will provide background)
		delete updatedView.backgroundColor
		delete updatedView.backgroundGradient
		delete updatedView.backgroundImage
		delete updatedView.backgroundFit
		doc.v.set(viewId, updatedView)

		// Create instance objects for each prototype
		for (const protoId of protoIds) {
			const proto = doc.o.get(protoId)
			if (!proto) continue

			// Check if an instance already exists for this view/prototype combination
			let instanceExists = false
			doc.o.forEach((existingObj) => {
				if (existingObj.proto === protoId && existingObj.vi === viewId) {
					instanceExists = true
				}
			})
			if (instanceExists) continue

			// Create instance with proto reference - only type, proto, and view needed
			// All other properties are inherited from prototype
			const instanceId = generateObjectId()
			const instance: Partial<StoredObject> = {
				t: proto.t,
				proto: protoId,
				vi: viewId
			}

			doc.o.set(instanceId, instance as StoredObject)

			// Add to root children (template objects go to root layer)
			doc.r.push([[0, instanceId]])
		}
	}, yDoc.clientID)
}

/**
 * Remove template from a view
 * Options control what happens to instance objects
 */
export function removeTemplateFromView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	options?: {
		/**
		 * What to do with instance objects
		 * - 'detach': Keep as regular objects (copy inherited values)
		 * - 'delete': Remove instance objects
		 */
		instanceAction?: 'detach' | 'delete'
	}
): void {
	const view = doc.v.get(viewId)
	if (!view || !view.tpl) return

	const templateId = view.tpl
	const protoIds = doc.tpo.get(templateId)?.toArray() || []
	const instanceAction = options?.instanceAction ?? 'detach'

	yDoc.transact(() => {
		// Handle instance objects
		doc.o.forEach((obj, objId) => {
			if (obj.vi === viewId && obj.proto && protoIds.includes(obj.proto)) {
				if (instanceAction === 'delete') {
					doc.o.delete(objId)
					removeObjectFromChildren(doc, toObjectId(objId))
				} else {
					// Detach: copy inherited values
					const protoObj = doc.o.get(obj.proto)
					if (protoObj) {
						const merged = { ...protoObj, ...obj } as StoredObject
						delete merged.proto
						doc.o.set(objId, merged)
					} else {
						const updated = { ...obj }
						delete updated.proto
						doc.o.set(objId, updated as StoredObject)
					}
				}
			}
		})

		// Remove template reference from view
		const updatedView: StoredView = { ...view }
		delete updatedView.tpl
		doc.v.set(viewId, updatedView)
	}, yDoc.clientID)
}

/**
 * Get all views using a template
 */
export function getViewsUsingTemplate(doc: YPrezilloDocument, templateId: TemplateId): ViewId[] {
	const views: ViewId[] = []
	doc.v.forEach((view, id) => {
		if (view.tpl === templateId) {
			views.push(toViewId(id))
		}
	})
	return views
}

// ============================================================================
// Snap Guide Management
// ============================================================================

/**
 * Add a snap guide to a template
 */
export function addSnapGuide(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	guide: SnapGuide
): void {
	const stored = doc.tpl.get(templateId)
	if (!stored) return

	yDoc.transact(() => {
		const updated = { ...stored }
		const guides = [...(updated.sg || [])]
		guides.push(compactSnapGuide(guide))
		updated.sg = guides
		doc.tpl.set(templateId, updated)
	}, yDoc.clientID)
}

/**
 * Update a snap guide
 */
export function updateSnapGuide(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	index: number,
	guide: SnapGuide
): void {
	const stored = doc.tpl.get(templateId)
	if (!stored || !stored.sg || index < 0 || index >= stored.sg.length) return

	yDoc.transact(() => {
		const updated = { ...stored }
		const guides = [...(updated.sg || [])]
		guides[index] = compactSnapGuide(guide)
		updated.sg = guides
		doc.tpl.set(templateId, updated)
	}, yDoc.clientID)
}

/**
 * Remove a snap guide
 */
export function removeSnapGuide(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	index: number
): void {
	const stored = doc.tpl.get(templateId)
	if (!stored || !stored.sg || index < 0 || index >= stored.sg.length) return

	yDoc.transact(() => {
		const updated = { ...stored }
		const guides = [...(updated.sg || [])]
		guides.splice(index, 1)
		updated.sg = guides.length > 0 ? guides : undefined
		doc.tpl.set(templateId, updated)
	}, yDoc.clientID)
}

/**
 * Set all snap guides for a template
 */
export function setSnapGuides(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	templateId: TemplateId,
	guides: SnapGuide[]
): void {
	const stored = doc.tpl.get(templateId)
	if (!stored) return

	yDoc.transact(() => {
		const updated = { ...stored }
		updated.sg = guides.length > 0 ? guides.map(compactSnapGuide) : undefined
		doc.tpl.set(templateId, updated)
	}, yDoc.clientID)
}

// ============================================================================
// Hidden Objects (per-instance visibility)
// ============================================================================

/**
 * Find instance object by prototype and view
 */
function findInstanceByProtoAndView(
	doc: YPrezilloDocument,
	prototypeId: ObjectId,
	viewId: ViewId
): string | undefined {
	let instanceId: string | undefined
	doc.o.forEach((obj, id) => {
		if (obj.proto === prototypeId && obj.vi === viewId) {
			instanceId = id
		}
	})
	return instanceId
}

/**
 * Hide a prototype's instance on a specific view
 */
export function hidePrototypeOnView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	prototypeId: ObjectId
): void {
	const instanceId = findInstanceByProtoAndView(doc, prototypeId, viewId)
	if (!instanceId) return

	const instance = doc.o.get(instanceId)
	if (!instance) return

	yDoc.transact(() => {
		const updated = { ...instance, hid: true as const }
		doc.o.set(instanceId, updated)
	}, yDoc.clientID)
}

/**
 * Show a hidden prototype's instance on a specific view
 */
export function showPrototypeOnView(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	viewId: ViewId,
	prototypeId: ObjectId
): void {
	const instanceId = findInstanceByProtoAndView(doc, prototypeId, viewId)
	if (!instanceId) return

	const instance = doc.o.get(instanceId)
	if (!instance) return

	yDoc.transact(() => {
		const updated = { ...instance }
		delete updated.hid
		doc.o.set(instanceId, updated as StoredObject)
	}, yDoc.clientID)
}

/**
 * Check if a prototype's instance is hidden on a view
 */
export function isPrototypeHiddenOnView(
	doc: YPrezilloDocument,
	viewId: ViewId,
	prototypeId: ObjectId
): boolean {
	const instanceId = findInstanceByProtoAndView(doc, prototypeId, viewId)
	if (!instanceId) return false

	const instance = doc.o.get(instanceId)
	return instance?.hid === true
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the template ID that contains a given prototype object
 * Returns undefined if the object is not a prototype in any template
 */
export function getTemplateIdForPrototype(
	doc: YPrezilloDocument,
	prototypeId: ObjectId
): TemplateId | undefined {
	for (const [templateId, protoArray] of doc.tpo.entries()) {
		if (protoArray.toArray().includes(prototypeId)) {
			return toTemplateId(templateId)
		}
	}
	return undefined
}

/**
 * Remove an object from all children arrays
 */
function removeObjectFromChildren(doc: YPrezilloDocument, objectId: ObjectId): void {
	// Remove from root children
	const rootArray = doc.r.toArray()
	for (let i = rootArray.length - 1; i >= 0; i--) {
		const [type, id] = rootArray[i]
		if (type === 0 && id === objectId) {
			doc.r.delete(i, 1)
		}
	}

	// Remove from container children
	doc.ch.forEach((childArray) => {
		const children = childArray.toArray()
		for (let i = children.length - 1; i >= 0; i--) {
			const [type, id] = children[i]
			if (type === 0 && id === objectId) {
				childArray.delete(i, 1)
			}
		}
	})
}

// vim: ts=4
