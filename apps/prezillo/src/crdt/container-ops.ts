// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Container (layer/group) CRUD operations
 */

import * as Y from 'yjs'

import { getContainerChildren } from './document'
import type { ContainerId } from './ids'
import { generateContainerId } from './ids'
import type { ContainerType } from './runtime-types'
import type { ChildRef, StoredContainer, YPrezilloDocument } from './stored-types'

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
