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
 * Container (layer/group) CRUD operations
 */

import * as Y from 'yjs'
import type { YPrezilloDocument, ChildRef, StoredContainer, StoredObject } from './stored-types'
import type { ObjectId, ContainerId } from './ids'
import { generateContainerId, toObjectId, toContainerId } from './ids'
import type { ContainerNode, ContainerType, PrezilloObject } from './runtime-types'
import { expandContainer, compactContainer, expandObject } from './type-converters'
import { getContainerChildren } from './document'

/**
 * Create a new container (layer or group)
 */
export function createContainer(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	type: ContainerType,
	options?: {
		name?: string
		parentId?: ContainerId
		x?: number
		y?: number
		insertIndex?: number
	}
): ContainerId {
	const containerId = generateContainerId()

	yDoc.transact(() => {
		const container: StoredContainer = {
			t: type === 'layer' ? 'L' : 'G',
			n: options?.name || (type === 'layer' ? 'New Layer' : 'Group'),
			xy: [options?.x ?? 0, options?.y ?? 0],
			x: true // expanded by default
		}

		if (options?.parentId) {
			container.p = options.parentId
		}

		doc.c.set(containerId, container)

		// Create children array for container
		const children = new Y.Array<ChildRef>()
		doc.ch.set(containerId, children)

		// Add to parent or root
		const childRef: ChildRef = [1, containerId]

		if (options?.parentId) {
			const parentChildren = getContainerChildren(yDoc, doc, options.parentId)
			if (options.insertIndex !== undefined && options.insertIndex < parentChildren.length) {
				parentChildren.insert(options.insertIndex, [childRef])
			} else {
				parentChildren.push([childRef])
			}
		} else {
			if (options?.insertIndex !== undefined && options.insertIndex < doc.r.length) {
				doc.r.insert(options.insertIndex, [childRef])
			} else {
				doc.r.push([childRef])
			}
		}
	}, yDoc.clientID)

	return containerId
}

/**
 * Get a container by ID (returns runtime type)
 */
export function getContainer(
	doc: YPrezilloDocument,
	containerId: ContainerId
): ContainerNode | undefined {
	const stored = doc.c.get(containerId)
	if (!stored) return undefined
	return expandContainer(containerId, stored)
}

/**
 * Update container properties
 */
export function updateContainer(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId,
	updates: Partial<ContainerNode>
): void {
	const existing = doc.c.get(containerId)
	if (!existing) return

	const expanded = expandContainer(containerId, existing)
	const updated = { ...expanded, ...updates, id: containerId }
	const compacted = compactContainer(updated)

	yDoc.transact(() => {
		doc.c.set(containerId, compacted)
	}, yDoc.clientID)
}

/**
 * Delete a container and all its contents
 */
export function deleteContainer(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId,
	deleteContents: boolean = true
): ObjectId[] {
	const container = doc.c.get(containerId)
	if (!container) return []

	const deletedObjectIds: ObjectId[] = []

	yDoc.transact(() => {
		if (deleteContents) {
			// Recursively delete contents
			const children = doc.ch.get(containerId)
			if (children) {
				const childArray = children.toArray()
				childArray.forEach((ref) => {
					if (ref[0] === 0) {
						// Object
						const objId = toObjectId(ref[1])
						const obj = doc.o.get(objId)
						if (obj) {
							doc.o.delete(objId)
							// Clean up rich text
							if (obj.t === 'B' && (obj as any).tid) {
								doc.rt.delete((obj as any).tid)
							}
							deletedObjectIds.push(objId)
						}
					} else {
						// Nested container
						const nestedIds = deleteContainer(yDoc, doc, toContainerId(ref[1]), true)
						deletedObjectIds.push(...nestedIds)
					}
				})
			}
		} else {
			// Move contents to container's parent
			const children = doc.ch.get(containerId)
			if (children) {
				const childArray = children.toArray()
				childArray.forEach((ref) => {
					if (ref[0] === 0) {
						// Object - update parent
						const objId = toObjectId(ref[1])
						const obj = doc.o.get(objId)
						if (obj) {
							const newX = (container.xy?.[0] ?? 0) + (obj.xy?.[0] ?? 0)
							const newY = (container.xy?.[1] ?? 0) + (obj.xy?.[1] ?? 0)
							doc.o.set(objId, {
								...obj,
								xy: [newX, newY],
								p: container.p
							})
						}
					} else {
						// Nested container - update parent
						const nestedId = toContainerId(ref[1])
						const nested = doc.c.get(nestedId)
						if (nested) {
							const newX = (container.xy?.[0] ?? 0) + (nested.xy?.[0] ?? 0)
							const newY = (container.xy?.[1] ?? 0) + (nested.xy?.[1] ?? 0)
							doc.c.set(nestedId, {
								...nested,
								xy: [newX, newY],
								p: container.p
							})
						}
					}

					// Add to parent's children
					if (container.p) {
						const parentChildren = getContainerChildren(
							yDoc,
							doc,
							toContainerId(container.p)
						)
						parentChildren.push([ref])
					} else {
						doc.r.push([ref])
					}
				})
			}
		}

		// Remove container from its parent's children
		const containerRef: ChildRef = [1, containerId]
		if (container.p) {
			const parentChildren = doc.ch.get(container.p)
			if (parentChildren) {
				removeChildRef(parentChildren, containerRef)
			}
		} else {
			removeChildRef(doc.r, containerRef)
		}

		// Delete container's children array
		doc.ch.delete(containerId)

		// Delete container itself
		doc.c.delete(containerId)
	}, yDoc.clientID)

	return deletedObjectIds
}

/**
 * Create a group from selected objects
 */
export function groupObjects(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectIds: ObjectId[],
	options?: { name?: string }
): ContainerId {
	if (objectIds.length === 0) {
		throw new Error('Cannot create empty group')
	}

	// Calculate group bounds and find common parent
	let minX = Infinity,
		minY = Infinity
	let maxX = -Infinity,
		maxY = -Infinity
	let commonParentId: ContainerId | undefined

	objectIds.forEach((id, index) => {
		const obj = doc.o.get(id)
		if (!obj) return

		const x = obj.xy[0]
		const y = obj.xy[1]
		const w = obj.wh[0]
		const h = obj.wh[1]

		minX = Math.min(minX, x)
		minY = Math.min(minY, y)
		maxX = Math.max(maxX, x + w)
		maxY = Math.max(maxY, y + h)

		// Track common parent (assumes all have same parent for simplicity)
		if (index === 0) {
			commonParentId = obj.p ? toContainerId(obj.p) : undefined
		}
	})

	const groupId = generateContainerId()

	yDoc.transact(() => {
		// Create group at calculated position
		const group: StoredContainer = {
			t: 'G',
			n: options?.name || 'Group',
			xy: [minX, minY],
			x: false // collapsed by default
		}

		if (commonParentId) {
			group.p = commonParentId
		}

		doc.c.set(groupId, group)

		// Create children array for group
		const groupChildren = new Y.Array<ChildRef>()
		doc.ch.set(groupId, groupChildren)

		// Move objects into group
		objectIds.forEach((objectId) => {
			const obj = doc.o.get(objectId)
			if (!obj) return

			// Remove from current parent
			const childRef: ChildRef = [0, objectId]
			if (obj.p) {
				const oldChildren = doc.ch.get(obj.p)
				if (oldChildren) {
					removeChildRef(oldChildren, childRef)
				}
			} else {
				removeChildRef(doc.r, childRef)
			}

			// Adjust position to be relative to group
			doc.o.set(objectId, {
				...obj,
				xy: [obj.xy[0] - minX, obj.xy[1] - minY],
				p: groupId
			})

			// Add to group's children
			groupChildren.push([childRef])
		})

		// Add group to parent or root
		const groupRef: ChildRef = [1, groupId]
		if (commonParentId) {
			const parentChildren = getContainerChildren(yDoc, doc, commonParentId)
			parentChildren.push([groupRef])
		} else {
			doc.r.push([groupRef])
		}
	}, yDoc.clientID)

	return groupId
}

/**
 * Ungroup a container (flatten children to parent)
 */
export function ungroupContainer(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId
): ObjectId[] {
	const container = doc.c.get(containerId)
	if (!container) return []

	const freedObjectIds: ObjectId[] = []

	yDoc.transact(() => {
		const children = doc.ch.get(containerId)
		if (!children) return

		const childArray = children.toArray()

		childArray.forEach((childRef) => {
			if (childRef[0] === 0) {
				// Object
				const objId = toObjectId(childRef[1])
				const obj = doc.o.get(objId)
				if (obj) {
					// Convert position to absolute (relative to container's parent)
					const newX = (container.xy?.[0] ?? 0) + (obj.xy?.[0] ?? 0)
					const newY = (container.xy?.[1] ?? 0) + (obj.xy?.[1] ?? 0)

					doc.o.set(objId, {
						...obj,
						xy: [newX, newY],
						p: container.p
					})

					freedObjectIds.push(objId)
				}
			} else {
				// Nested container - update its parent
				const nestedId = toContainerId(childRef[1])
				const nested = doc.c.get(nestedId)
				if (nested) {
					const newX = (container.xy?.[0] ?? 0) + (nested.xy?.[0] ?? 0)
					const newY = (container.xy?.[1] ?? 0) + (nested.xy?.[1] ?? 0)

					doc.c.set(nestedId, {
						...nested,
						xy: [newX, newY],
						p: container.p
					})
				}
			}

			// Add child to container's parent
			if (container.p) {
				const parentChildren = getContainerChildren(yDoc, doc, toContainerId(container.p))
				parentChildren.push([childRef])
			} else {
				doc.r.push([childRef])
			}
		})

		// Remove container from its parent
		const containerRef: ChildRef = [1, containerId]
		if (container.p) {
			const parentChildren = doc.ch.get(container.p)
			if (parentChildren) {
				removeChildRef(parentChildren, containerRef)
			}
		} else {
			removeChildRef(doc.r, containerRef)
		}

		// Delete container's children array and the container itself
		doc.ch.delete(containerId)
		doc.c.delete(containerId)
	}, yDoc.clientID)

	return freedObjectIds
}

/**
 * Move container to different parent/position
 */
export function moveContainer(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId,
	newParentId: ContainerId | undefined,
	insertIndex?: number
): void {
	const container = doc.c.get(containerId)
	if (!container) return

	yDoc.transact(() => {
		const childRef: ChildRef = [1, containerId]

		// Remove from old parent
		if (container.p) {
			const oldChildren = doc.ch.get(container.p)
			if (oldChildren) {
				removeChildRef(oldChildren, childRef)
			}
		} else {
			removeChildRef(doc.r, childRef)
		}

		// Add to new parent
		if (newParentId) {
			const newChildren = getContainerChildren(yDoc, doc, newParentId)
			if (insertIndex !== undefined && insertIndex < newChildren.length) {
				newChildren.insert(insertIndex, [childRef])
			} else {
				newChildren.push([childRef])
			}
		} else {
			if (insertIndex !== undefined && insertIndex < doc.r.length) {
				doc.r.insert(insertIndex, [childRef])
			} else {
				doc.r.push([childRef])
			}
		}

		// Update container's parentId
		if (newParentId) {
			doc.c.set(containerId, { ...container, p: newParentId })
		} else {
			const updated = { ...container }
			delete updated.p
			doc.c.set(containerId, updated)
		}
	}, yDoc.clientID)
}

/**
 * Reorder container within same parent (change z-index)
 */
export function reorderContainer(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId,
	newIndex: number
): void {
	const container = doc.c.get(containerId)
	if (!container) return

	const children = container.p ? doc.ch.get(container.p) : doc.r

	if (!children) return

	yDoc.transact(() => {
		const childRef: ChildRef = [1, containerId]
		const currentIndex = findChildRefIndex(children, childRef)

		if (currentIndex >= 0 && currentIndex !== newIndex) {
			children.delete(currentIndex, 1)
			const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex
			children.insert(Math.min(adjustedIndex, children.length), [childRef])
		}
	}, yDoc.clientID)
}

/**
 * Toggle container visibility
 */
export function toggleContainerVisibility(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId
): void {
	const container = doc.c.get(containerId)
	if (!container) return

	yDoc.transact(() => {
		const isVisible = container.v !== false
		if (isVisible) {
			doc.c.set(containerId, { ...container, v: false })
		} else {
			const updated = { ...container }
			delete updated.v
			doc.c.set(containerId, updated)
		}
	}, yDoc.clientID)
}

/**
 * Toggle container locked state
 */
export function toggleContainerLock(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId
): void {
	const container = doc.c.get(containerId)
	if (!container) return

	yDoc.transact(() => {
		const isLocked = container.k === true
		if (isLocked) {
			const updated = { ...container }
			delete updated.k
			doc.c.set(containerId, updated)
		} else {
			doc.c.set(containerId, { ...container, k: true })
		}
	}, yDoc.clientID)
}

/**
 * Toggle container expanded state (for UI)
 */
export function toggleContainerExpanded(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId
): void {
	const container = doc.c.get(containerId)
	if (!container) return

	yDoc.transact(() => {
		doc.c.set(containerId, { ...container, x: !container.x })
	}, yDoc.clientID)
}

/**
 * Get all layers (root-level containers of type 'layer')
 */
export function getLayers(doc: YPrezilloDocument): ContainerNode[] {
	const layers: ContainerNode[] = []

	doc.r.toArray().forEach((ref) => {
		if (ref[0] === 1) {
			const container = doc.c.get(ref[1])
			if (container && container.t === 'L') {
				layers.push(expandContainer(ref[1], container))
			}
		}
	})

	return layers
}

/**
 * Get children of a container
 */
export function getContainerChildrenData(
	doc: YPrezilloDocument,
	containerId: ContainerId
): Array<{ type: 'object' | 'container'; data: PrezilloObject | ContainerNode }> {
	const children = doc.ch.get(containerId)
	if (!children) return []

	const result: Array<{ type: 'object' | 'container'; data: PrezilloObject | ContainerNode }> = []

	children.toArray().forEach((ref) => {
		if (ref[0] === 0) {
			const obj = doc.o.get(ref[1])
			if (obj) {
				result.push({ type: 'object', data: expandObject(ref[1], obj) })
			}
		} else {
			const container = doc.c.get(ref[1])
			if (container) {
				result.push({ type: 'container', data: expandContainer(ref[1], container) })
			}
		}
	})

	return result
}

// Helper functions

function removeChildRef(array: Y.Array<ChildRef>, ref: ChildRef): void {
	const idx = findChildRefIndex(array, ref)
	if (idx >= 0) {
		array.delete(idx, 1)
	}
}

function findChildRefIndex(array: Y.Array<ChildRef>, ref: ChildRef): number {
	const arr = array.toArray()
	return arr.findIndex((r) => r[0] === ref[0] && r[1] === ref[1])
}

// vim: ts=4
