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

import { useState, useEffect, useCallback, useRef } from 'react'

import type { RtdbClient } from '@cloudillo/rtdb'
import type { StoredPageRecord, PageRecord } from '../rtdb/types.js'
import { fromStoredPage } from '../rtdb/transform.js'

type PageWithId = PageRecord & { id: string }

export interface LazyPageTree {
	pages: Map<string, PageWithId>
	pagesWithChildren: Set<string>
	expanded: Set<string>
	loadingChildren: Set<string>
	rootsLoaded: boolean
	orphanPage: PageWithId | null
	expand(pageId: string): void
	collapse(pageId: string): void
	toggleExpand(pageId: string): void
	navigateToPage(pageId: string): Promise<void>
}

export function useLazyPageTree(client: RtdbClient | undefined): LazyPageTree {
	const [pages, setPages] = useState<Map<string, PageWithId>>(new Map())
	const [pagesWithChildren, setPagesWithChildren] = useState<Set<string>>(new Set())
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set())
	const [rootsLoaded, setRootsLoaded] = useState(false)
	const [orphanPage, setOrphanPage] = useState<PageWithId | null>(null)

	// Per-level page data: key is parent id ('__root__' for roots), value is children map
	const levelDataRef = useRef<Map<string, Map<string, PageWithId>>>(new Map())
	// Active child subscriptions: key is parent id, value is unsubscribe fn
	const childSubsRef = useRef<Map<string, () => void>>(new Map())
	// Track which levels have received their initial snapshot
	const levelReadyRef = useRef<Set<string>>(new Set())

	// Rebuild merged pages map from all level data
	const rebuildPages = useCallback(() => {
		const merged = new Map<string, PageWithId>()
		const parentIds = new Set<string>()
		for (const levelMap of levelDataRef.current.values()) {
			for (const [id, page] of levelMap) {
				merged.set(id, page)
				if (page.hasChildren) parentIds.add(id)
			}
		}
		setPages(merged)
		setPagesWithChildren(parentIds)
	}, [])

	// Subscribe to children of a given parent
	const subscribeChildren = useCallback(
		(parentId: string) => {
			if (!client || childSubsRef.current.has(parentId)) return

			const filterValue = parentId === '__root__' ? '__root__' : parentId

			const unsub = client
				.collection('p')
				.where('pp', '==', filterValue)
				.orderBy('o', 'asc')
				.onSnapshot(
					(snapshot) => {
						const levelMap = new Map<string, PageWithId>()
						snapshot.forEach((doc) => {
							const page = fromStoredPage(doc.data() as StoredPageRecord)
							levelMap.set(doc.id, { id: doc.id, ...page })
						})
						levelDataRef.current.set(parentId, levelMap)
						levelReadyRef.current.add(parentId)
						rebuildPages()

						// Clear loading state for this level
						if (parentId !== '__root__') {
							setLoadingChildren((prev) => {
								if (!prev.has(parentId)) return prev
								const next = new Set(prev)
								next.delete(parentId)
								return next
							})
						} else {
							setRootsLoaded(true)
						}

						// Auto-expand pages with autoExpand flag
						const toAutoExpand: string[] = []
						for (const [id, page] of levelMap) {
							if (page.autoExpand) {
								toAutoExpand.push(id)
							}
						}
						if (toAutoExpand.length > 0) {
							setExpanded((prev) => {
								const next = new Set(prev)
								let changed = false
								for (const id of toAutoExpand) {
									if (!next.has(id)) {
										next.add(id)
										changed = true
									}
								}
								return changed ? next : prev
							})
						}
					},
					(err) => {
						console.error(
							`[useLazyPageTree] Subscription error for parent=${parentId}:`,
							err
						)
						if (parentId !== '__root__') {
							setLoadingChildren((prev) => {
								if (!prev.has(parentId)) return prev
								const next = new Set(prev)
								next.delete(parentId)
								return next
							})
						}
					}
				)

			childSubsRef.current.set(parentId, unsub)
		},
		[client, rebuildPages]
	)

	// 1. Root pages subscription (always active)
	useEffect(() => {
		if (!client) return

		subscribeChildren('__root__')

		return () => {
			// Cleanup all subscriptions on unmount
			for (const unsub of childSubsRef.current.values()) {
				unsub()
			}
			childSubsRef.current.clear()
			levelDataRef.current.clear()
			levelReadyRef.current.clear()
		}
	}, [client, subscribeChildren])

	// 2. Subscribe to children when nodes are expanded
	useEffect(() => {
		for (const parentId of expanded) {
			if (!childSubsRef.current.has(parentId)) {
				subscribeChildren(parentId)
			}
		}
	}, [expanded, subscribeChildren])

	// Expand a node
	const expand = useCallback((pageId: string) => {
		setExpanded((prev) => {
			if (prev.has(pageId)) return prev
			const next = new Set(prev)
			next.add(pageId)
			return next
		})
		// Add to loading if subscription doesn't exist yet
		if (!levelReadyRef.current.has(pageId)) {
			setLoadingChildren((prev) => {
				const next = new Set(prev)
				next.add(pageId)
				return next
			})
		}
	}, [])

	// Collapse a node (keep subscription alive for instant re-expand)
	const collapse = useCallback((pageId: string) => {
		setExpanded((prev) => {
			if (!prev.has(pageId)) return prev
			const next = new Set(prev)
			next.delete(pageId)
			return next
		})
	}, [])

	const toggleExpand = useCallback((pageId: string) => {
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(pageId)) {
				next.delete(pageId)
			} else {
				next.add(pageId)
				// Add to loading if not yet loaded
				if (!levelReadyRef.current.has(pageId)) {
					setLoadingChildren((prev) => {
						const next = new Set(prev)
						next.add(pageId)
						return next
					})
				}
			}
			return next
		})
	}, [])

	// Navigate to a page — resolves ancestors and expands tree path
	const navigateToPage = useCallback(
		async (pageId: string) => {
			if (!client) return

			// Clear any previous orphan page
			setOrphanPage(null)

			// Try to find the page in loaded data first
			let page = pages.get(pageId)

			// If not loaded, fetch it
			if (!page) {
				const snap = await client.ref(`p/${pageId}`).get()
				if (!snap.exists) return
				const data = fromStoredPage(snap.data() as StoredPageRecord)
				page = { id: pageId, ...data }
			}

			// Walk ancestry chain
			const ancestorIds: string[] = []
			let current = page
			while (current.parentPageId && current.parentPageId !== '__root__') {
				ancestorIds.unshift(current.parentPageId)
				// Try loaded pages first
				let parent = pages.get(current.parentPageId)
				if (!parent) {
					const snap = await client.ref(`p/${current.parentPageId}`).get()
					if (!snap.exists) break
					const data = fromStoredPage(snap.data() as StoredPageRecord)
					parent = { id: current.parentPageId, ...data }
				}
				current = parent
			}

			// Check if chain reaches root
			if (current.parentPageId === '__root__') {
				// Page is in the tree — expand all ancestors top-down
				setExpanded((prev) => {
					const next = new Set(prev)
					let changed = false
					for (const id of ancestorIds) {
						if (!next.has(id)) {
							next.add(id)
							changed = true
						}
					}
					return changed ? next : prev
				})
				// Trigger subscriptions for any unloaded ancestors
				for (const id of ancestorIds) {
					if (!levelReadyRef.current.has(id)) {
						setLoadingChildren((prev) => {
							const next = new Set(prev)
							next.add(id)
							return next
						})
					}
				}
			} else if (!current.parentPageId) {
				// Orphan page — show in "Current Page" section
				setOrphanPage(page)
			}
		},
		[client, pages]
	)

	return {
		pages,
		pagesWithChildren,
		expanded,
		loadingChildren,
		rootsLoaded,
		orphanPage,
		expand,
		collapse,
		toggleExpand,
		navigateToPage
	}
}

// vim: ts=4
