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

import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from './types.js'
import { toStoredPage } from './transform.js'
import { shortId } from './ids.js'

export async function createPage(
	client: RtdbClient,
	userId: string,
	title: string,
	parentPageId?: string
): Promise<string> {
	const id = shortId()
	const now = new Date().toISOString()

	await client
		.collection('p')
		.doc(id)
		.set(
			toStoredPage({
				title,
				...(parentPageId !== undefined && { parentPageId }),
				order: Date.now(),
				createdAt: now,
				updatedAt: now,
				createdBy: userId
			})
		)

	return id
}

export async function updatePage(
	client: RtdbClient,
	pageId: string,
	updates: Partial<Pick<PageRecord, 'title' | 'icon' | 'coverImage'>>
): Promise<void> {
	const stored: Record<string, any> = {}
	if (updates.title !== undefined) stored.ti = updates.title
	if (updates.icon !== undefined) stored.ic = updates.icon
	if (updates.coverImage !== undefined) stored.ci = updates.coverImage
	stored.ua = new Date().toISOString()

	await client.ref(`p/${pageId}`).update(stored)
}

/** Check if `ancestorId` is an ancestor of `pageId` (prevents circular reparenting) */
export function isAncestor(
	pageId: string,
	ancestorId: string,
	pages: Map<string, PageRecord & { id: string }>
): boolean {
	let current = pages.get(pageId)
	while (current?.parentPageId) {
		if (current.parentPageId === ancestorId) return true
		current = pages.get(current.parentPageId)
	}
	return false
}

export async function movePage(
	client: RtdbClient,
	pageId: string,
	targetId: string,
	position: 'before' | 'after' | 'inside',
	pages: Map<string, PageRecord & { id: string }>
): Promise<void> {
	const target = pages.get(targetId)
	if (!target) return

	let newParentPageId: string | undefined
	let newOrder: number

	if (position === 'inside') {
		// Reparent: becomes child of target
		newParentPageId = targetId
		// Place at end of target's children
		let maxOrder = 0
		for (const p of pages.values()) {
			if (p.parentPageId === targetId && p.order > maxOrder) {
				maxOrder = p.order
			}
		}
		newOrder = maxOrder + 1
	} else {
		// Reorder: same parent as target
		newParentPageId = target.parentPageId

		// Get siblings sorted by order
		const siblings = Array.from(pages.values())
			.filter((p) => {
				const sameParent = newParentPageId
					? p.parentPageId === newParentPageId
					: !p.parentPageId
				return sameParent && p.id !== pageId
			})
			.sort((a, b) => a.order - b.order)

		const targetIdx = siblings.findIndex((p) => p.id === targetId)

		if (position === 'before') {
			const prevOrder = targetIdx > 0 ? siblings[targetIdx - 1].order : undefined
			const targetOrder = target.order
			if (prevOrder !== undefined) {
				newOrder = (prevOrder + targetOrder) / 2
			} else {
				newOrder = targetOrder - 1
			}
		} else {
			// 'after'
			const targetOrder = target.order
			const nextOrder =
				targetIdx < siblings.length - 1 ? siblings[targetIdx + 1].order : undefined
			if (nextOrder !== undefined) {
				newOrder = (targetOrder + nextOrder) / 2
			} else {
				newOrder = targetOrder + 1
			}
		}
	}

	const stored: Record<string, any> = {
		o: newOrder,
		ua: new Date().toISOString()
	}

	// Update parentPageId: set if reparenting, remove if moving to root
	if (newParentPageId !== undefined) {
		stored.pp = newParentPageId
	} else {
		// Moving to root level — clear parent
		stored.pp = null
	}

	await client.ref(`p/${pageId}`).update(stored)
}

export async function deletePage(client: RtdbClient, pageId: string): Promise<void> {
	const batch = client.batch()

	// Delete all blocks for this page
	const blocksSnapshot = await client.collection('b').where('p', '==', pageId).get()
	blocksSnapshot.forEach((doc) => batch.delete(client.ref(`b/${doc.id}`)))

	// Delete the page itself
	batch.delete(client.ref(`p/${pageId}`))

	await batch.commit()
}

// vim: ts=4
