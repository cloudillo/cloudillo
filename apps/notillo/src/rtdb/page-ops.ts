// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { RtdbClient } from '@cloudillo/rtdb'
import type { StoredPageRecord, PageRecord } from './types.js'
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

	// Mark parent as having children
	if (parentPageId && parentPageId !== '__root__') {
		await client.ref(`p/${parentPageId}`).update({ hc: true })
	}

	return id
}

export async function updatePage(
	client: RtdbClient,
	pageId: string,
	updates: Partial<Pick<PageRecord, 'title' | 'icon' | 'coverImage'>>
): Promise<void> {
	const stored: Record<string, unknown> = {}
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

	// Remember old parent before the move
	const oldParentPageId = pages.get(pageId)?.parentPageId

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
			.filter((p) => p.parentPageId === newParentPageId && p.id !== pageId)
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

	const stored: Record<string, unknown> = {
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

	// Update hc flag on new parent
	if (newParentPageId && newParentPageId !== '__root__') {
		await client.ref(`p/${newParentPageId}`).update({ hc: true })
	}

	// Check if old parent still has children
	if (oldParentPageId && oldParentPageId !== '__root__' && oldParentPageId !== newParentPageId) {
		const remaining = await client
			.collection('p')
			.where('pp', '==', oldParentPageId)
			.limit(1)
			.get()
		if (remaining.empty) {
			await client.ref(`p/${oldParentPageId}`).update({ hc: null })
		}
	}
}

export async function deletePage(client: RtdbClient, pageId: string): Promise<void> {
	// Read parent before deleting
	const pageSnap = await client.ref(`p/${pageId}`).get()
	const parentPageId = pageSnap.exists ? (pageSnap.data() as StoredPageRecord).pp : undefined

	const batch = client.batch()

	// Delete all blocks for this page
	const blocksSnapshot = await client.collection('b').where('p', '==', pageId).get()
	blocksSnapshot.forEach((doc) => {
		batch.delete(client.ref(`b/${doc.id}`))
	})

	// Delete the page itself
	batch.delete(client.ref(`p/${pageId}`))

	await batch.commit()

	// Check if parent still has children
	if (parentPageId && parentPageId !== '__root__') {
		const remaining = await client
			.collection('p')
			.where('pp', '==', parentPageId)
			.limit(1)
			.get()
		if (remaining.empty) {
			await client.ref(`p/${parentPageId}`).update({ hc: null })
		}
	}
}

export async function toggleAutoExpand(
	client: RtdbClient,
	pageId: string,
	autoExpand: boolean
): Promise<void> {
	await client.ref(`p/${pageId}`).update({
		ae: autoExpand || null,
		ua: new Date().toISOString()
	})
}

export async function pinToSidebar(client: RtdbClient, pageId: string): Promise<void> {
	await client.ref(`p/${pageId}`).update({
		pp: '__root__',
		o: Date.now(),
		ua: new Date().toISOString()
	})
}

export async function removeFromSidebar(client: RtdbClient, pageId: string): Promise<void> {
	await client.ref(`p/${pageId}`).update({
		pp: null,
		ua: new Date().toISOString()
	})
}

// vim: ts=4
