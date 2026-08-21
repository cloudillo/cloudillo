// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Block, BlockNoteEditor } from '@blocknote/core'
import type { ChangeEvent, QuerySnapshot, RtdbClient } from '@cloudillo/rtdb'
import { useEffect, useRef } from 'react'

import { getBlockOrder } from '../rtdb/block-ops.js'
import {
	cleanProps,
	compactBlockContent,
	compactBlockType,
	fromStoredBlock,
	toStoredBlock
} from '../rtdb/transform.js'
import {
	asBlockContent,
	asBlockProps,
	asBlockType,
	type BlockRecord,
	decodeStoredBlock,
	isTableContent,
	MEDIA_TYPES,
	type StoredBlockRecord,
	TABLE_TYPES
} from '../rtdb/types.js'

const DEBOUNCE_MS = 300
const ECHO_SUPPRESS_MS = 2000

function hasValidContent(record: BlockRecord): boolean {
	if (TABLE_TYPES.has(record.type)) {
		return isTableContent(record.content)
	}
	if (MEDIA_TYPES.has(record.type)) {
		return !!record.props || !!record.content
	}
	return true
}

// ── Per-block state tracking ──

interface BlockState {
	type: string
	props: Record<string, unknown>
	content: unknown // compact inline content array or compact table content
	parentBlockId: string | null // null = root
	order: number
}

// ── Helpers ──

function collectOrderedIds(blocks: Block[]): string[] {
	const ids: string[] = []
	for (const block of blocks) {
		ids.push(block.id)
		if (block.children?.length) {
			ids.push(...collectOrderedIds(block.children))
		}
	}
	return ids
}

function getBlockState(
	editor: BlockNoteEditor,
	blockId: string,
	storedOrder?: number
): BlockState | null {
	const block = editor.getBlock(blockId)
	if (!block) return null
	return {
		type: compactBlockType(block.type),
		props: cleanProps(block.props) ?? {},
		content: compactBlockContent(asBlockContent(block.content)) ?? [],
		parentBlockId: editor.getParentBlock(block)?.id ?? null,
		order: storedOrder ?? getBlockOrder(editor, blockId)
	}
}

interface PatchResult {
	patch: Record<string, unknown>
	debounce: boolean // true = content-only change, should debounce
}

function buildPartialUpdate(
	prev: BlockState,
	curr: BlockState,
	pageId: string,
	now: string,
	userId: string,
	ownerTag?: string
): PatchResult | null {
	const patch: Record<string, unknown> = {}
	let hasDiscreteChange = false

	if (curr.type !== prev.type) {
		patch.t = curr.type
		hasDiscreteChange = true
	}
	if (JSON.stringify(curr.props) !== JSON.stringify(prev.props)) {
		patch.pr = cleanProps(curr.props)
		hasDiscreteChange = true
	}
	if (JSON.stringify(curr.content) !== JSON.stringify(prev.content)) {
		patch.c = curr.content
	}
	if (curr.parentBlockId !== prev.parentBlockId) {
		patch.pb = curr.parentBlockId
		hasDiscreteChange = true
	}

	if (Object.keys(patch).length === 0) return null
	patch.p = pageId
	patch.ua = now
	if (userId !== ownerTag) patch.ub = userId

	// Debounce only when JUST content changed (typing). If any discrete field
	// also changed (type, props, position), send everything immediately.
	return { patch, debounce: !hasDiscreteChange && 'c' in patch }
}

function buildFullStoredBlock(
	editor: BlockNoteEditor,
	blockId: string,
	pageId: string,
	userId: string,
	ownerTag: string | undefined,
	now: string,
	order: number
): StoredBlockRecord | null {
	const block = editor.getBlock(blockId)
	if (!block) return null

	const parentBlockId = editor.getParentBlock(block)?.id ?? null

	return toStoredBlock(
		{
			pageId,
			type: block.type,
			props: block.props,
			content: asBlockContent(block.content),
			parentBlockId,
			order,
			updatedAt: now,
			updatedBy: userId
		},
		ownerTag
	)
}

// ── Local changes → RTDB (smart per-block sync) ──

export interface DocumentSyncResult {
	recentLocalUpdates: React.RefObject<Set<string>>
	blockStates: React.RefObject<Map<string, BlockState>>
	/**
	 * Commits every pending debounced write at once, the same way teardown and
	 * `pagehide` do. A no-op while the effect below is not running.
	 *
	 * A ref rather than a callback so it stays stable across renders while still
	 * reaching the current effect's closure. The publisher calls it before reading
	 * the document back out of RTDB — up to DEBOUNCE_MS of the newest typing lives
	 * only in a timer until then, and would publish as the previous revision.
	 *
	 * Best-effort in the same sense as the teardown flush: the writes are sent, not
	 * awaited. A publish racing a genuine disconnect loses them quietly.
	 */
	flush: React.RefObject<() => void>
}

export function useDocumentSync(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	pageId: string | undefined,
	userId: string | undefined,
	ownerTag: string | undefined,
	readOnly: boolean,
	knownBlockIds: Set<string>,
	knownBlockOrders: Map<string, number>
): DocumentSyncResult {
	const blockStates = useRef(new Map<string, BlockState>())
	const blockIdList = useRef<string[]>([])
	// Each pending write keeps its `commit` alongside the timer so teardown can run
	// it instead of dropping it.
	const pendingDebounces = useRef(
		new Map<
			string,
			{ timer: ReturnType<typeof setTimeout>; commit: (fromEditor: boolean) => void }
		>()
	)
	const recentLocalUpdates = useRef(new Set<string>())
	// Rebound to the live `flushPendingWrites` below on every run of the effect, and
	// left as a no-op whenever the effect is not running (read-only, no client, no
	// page open) — a publisher must not have to know which of those it is.
	const flush = useRef<() => void>(() => {})

	useEffect(() => {
		if (!editor || !client || !pageId || !userId || readOnly) return

		// Seed blockStates from editor (for change detection)
		// Use RTDB-stored orders for known blocks so fractional order computation
		// uses actual persisted values, not integer indices
		const initialIds = collectOrderedIds(editor.document)
		blockIdList.current = initialIds
		for (const id of initialIds) {
			const storedOrder = knownBlockOrders.get(id)
			const state = getBlockState(editor, id, storedOrder)
			if (state) blockStates.current.set(id, state)
		}

		// Only push blocks NOT already in RTDB
		const now = new Date().toISOString()
		for (const id of initialIds) {
			if (knownBlockIds.has(id)) continue
			const state = blockStates.current.get(id)
			const order = state?.order ?? getBlockOrder(editor, id)
			const stored = buildFullStoredBlock(editor, id, pageId, userId, ownerTag, now, order)
			if (stored) {
				markLocal(id)
				client.collection('b').doc(id).set(stored).catch(console.error)
			}
		}

		function markLocal(blockId: string) {
			recentLocalUpdates.current.add(blockId)
			setTimeout(() => recentLocalUpdates.current.delete(blockId), ECHO_SUPPRESS_MS)
		}

		function sendUpdate(blockId: string, patch: Record<string, unknown>) {
			markLocal(blockId)
			client!.collection('b').doc(blockId).update(patch).catch(console.error)
		}

		function sendSet(blockId: string) {
			const state = blockStates.current.get(blockId)
			const order = state?.order ?? getBlockOrder(editor!, blockId)
			const stored = buildFullStoredBlock(
				editor!,
				blockId,
				pageId!,
				userId!,
				ownerTag,
				new Date().toISOString(),
				order
			)
			if (!stored) return
			markLocal(blockId)
			client!.collection('b').doc(blockId).set(stored).catch(console.error)
		}

		function sendDelete(blockId: string) {
			client!.collection('b').doc(blockId).delete().catch(console.error)
		}

		function clearBlockDebounce(blockId: string) {
			const existing = pendingDebounces.current.get(blockId)
			if (existing) {
				clearTimeout(existing.timer)
				pendingDebounces.current.delete(blockId)
			}
		}

		// Compute a fractional order for a block based on its new neighbors' stored orders
		function computeOrderBetweenNeighbors(blockId: string): number {
			const block = editor!.getBlock(blockId)
			if (!block) return 1

			const parent = editor!.getParentBlock(block)
			const siblings = parent ? parent.children || [] : editor!.document
			const idx = siblings.findIndex((b: Block) => b.id === blockId)

			const prevId = idx > 0 ? siblings[idx - 1].id : null
			const nextId = idx < siblings.length - 1 ? siblings[idx + 1].id : null

			const prevOrder = prevId ? blockStates.current.get(prevId)?.order : undefined
			const nextOrder = nextId ? blockStates.current.get(nextId)?.order : undefined

			if (prevOrder !== undefined && nextOrder !== undefined) {
				return (prevOrder + nextOrder) / 2
			} else if (prevOrder !== undefined) {
				return prevOrder + 1
			} else if (nextOrder !== undefined) {
				return nextOrder - 1
			}
			return 1 // Only block in parent
		}

		function syncBlock(blockId: string, immediate: boolean, newOrder?: number) {
			const prev = blockStates.current.get(blockId)
			const curr = getBlockState(editor!, blockId, prev?.order)
			if (!curr) return

			if (!prev) {
				// New block — compute fractional order
				curr.order = computeOrderBetweenNeighbors(blockId)
				blockStates.current.set(blockId, curr)
				sendSet(blockId)
				return
			}

			// If move, override order with new fractional order
			if (newOrder !== undefined) {
				curr.order = newOrder
			}

			const result = buildPartialUpdate(
				prev,
				curr,
				pageId!,
				new Date().toISOString(),
				userId!,
				ownerTag
			)

			// Handle order patch when newOrder is explicitly provided
			if (newOrder !== undefined) {
				if (!result) {
					// Only order changed — create minimal patch
					const patch: Record<string, unknown> = {
						o: newOrder,
						p: pageId,
						ua: new Date().toISOString(),
						...(userId !== ownerTag && { ub: userId })
					}
					clearBlockDebounce(blockId)
					blockStates.current.set(blockId, curr)
					sendUpdate(blockId, patch)
					return
				} else {
					result.patch.o = newOrder
					result.debounce = false // Immediate for moves
				}
			}

			// No diff against what was last persisted, so nothing pending is worth
			// committing — and a timer left armed here would fire with the *previous*
			// keystroke's patch, re-persisting text the user just deleted. (Type
			// "hello", backspace it all inside DEBOUNCE_MS: the last backspace
			// produces no diff, and the stale timer would write back "h".)
			clearBlockDebounce(blockId)

			if (!result) return

			if (result.debounce && !immediate) {
				// Per-block debounce for content-only changes
				clearBlockDebounce(blockId)
				// `fromEditor` is false when the flush comes from teardown, where the
				// editor may already be gone: re-reading it would yield nothing and
				// drop the edit the flush exists to save, so that path sends the
				// patch built when the change fired.
				const commit = (fromEditor: boolean) => {
					pendingDebounces.current.delete(blockId)
					const latest = fromEditor
						? getBlockState(editor!, blockId, prev?.order)
						: undefined
					const latestResult = latest
						? buildPartialUpdate(
								prev,
								latest,
								pageId!,
								new Date().toISOString(),
								userId!,
								ownerTag
							)
						: null
					if (fromEditor) {
						// `latest` missing: the block is gone from the editor.
						// `latestResult` null: the block is back at the last-persisted
						// state — a collaborator's revert applied through
						// `editor.transact` does not fire `onChange`, so this timer was
						// never cleared. Either way writing the arm-time patch would
						// resurrect text the document no longer has, and suppress its
						// own echo so the editor would not correct itself.
						if (!latest || !latestResult) return
						blockStates.current.set(blockId, latest)
						sendUpdate(blockId, latestResult.patch)
						return
					}
					// Teardown flush: no editor left to re-read, so send the patch
					// built when the change fired.
					blockStates.current.set(blockId, curr)
					sendUpdate(blockId, result.patch)
				}
				pendingDebounces.current.set(blockId, {
					timer: setTimeout(() => commit(true), DEBOUNCE_MS),
					commit
				})
			} else {
				// Immediate sync — clear any pending debounce for this block first
				clearBlockDebounce(blockId)
				blockStates.current.set(blockId, curr)
				sendUpdate(blockId, result.patch)
			}
		}

		const unsubscribe = editor.onChange((_editor, context) => {
			const changes = context.getChanges()
			const handledIds = new Set<string>()

			// Two-pass processing: handle move/delete first so that 'move' always
			// takes priority over 'update' for the same block (BlockNote may fire
			// both, and the order in the changes array is not guaranteed).
			for (const change of changes) {
				const id = change.block.id
				if (change.type !== 'move' && change.type !== 'delete') continue
				if (handledIds.has(id)) continue
				handledIds.add(id)

				if (change.type === 'delete') {
					blockStates.current.delete(id)
					clearBlockDebounce(id)
					sendDelete(id)
				} else {
					// move — drag-drop reorder, indent/outdent, any structural move
					const newOrder = computeOrderBetweenNeighbors(id)
					syncBlock(id, true, newOrder)
				}
			}

			// Second pass: insert/update (skip blocks already handled above)
			for (const change of changes) {
				const id = change.block.id
				if (handledIds.has(id)) continue
				handledIds.add(id)

				if (change.type === 'insert') {
					// Skip blocks already in blockStates (e.g. from initial onChange
					// firing with ignoreInitial=false)
					if (blockStates.current.has(id)) continue
					const state = getBlockState(editor, id)
					if (state) {
						state.order = computeOrderBetweenNeighbors(id)
						blockStates.current.set(id, state)
						sendSet(id)
					}
				} else if (change.type === 'update') {
					// Content/props change — debounce for typing, immediate for discrete changes
					syncBlock(id, false)
				}
			}

			// Update blockIdList for any future reference
			blockIdList.current = collectOrderedIds(editor.document)
		}, false)

		// Flush rather than discard: teardown runs on unmount and on every page switch,
		// so clearing the timers would throw away up to DEBOUNCE_MS of typing.
		// Best-effort — `sendUpdate` ends in a `.catch`, so a write losing the race with
		// a real disconnect fails quietly.
		//
		// `commit(false)`, because on `pagehide` the editor may already be tearing down
		// and re-reading it would yield nothing.
		//
		// Idempotent: each `commit` deletes its own entry and the map is cleared at the
		// end, so a `pagehide` followed by the unmount flush is a second-time no-op.
		function flushPendingWrites() {
			for (const pending of pendingDebounces.current.values()) {
				clearTimeout(pending.timer)
				try {
					pending.commit(false)
				} catch (err) {
					console.error('[Notillo] Failed to flush a pending block write:', err)
				}
			}
			pendingDebounces.current.clear()
		}

		// The React teardown below covers unmount and page switch, but not the browser
		// closing the tab: typing with no DEBOUNCE_MS pause and then hitting reload
		// would discard the timer along with the page. `pagehide` fires on bfcache
		// eviction as well as real unload, and the hidden `visibilitychange` covers the
		// mobile cases browsers only guarantee through that one (`beforeunload` is
		// unreliable on mobile Safari). Best-effort: no awaiting, no blocking unload.
		const onPageHide = () => flushPendingWrites()
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flushPendingWrites()
		}
		window.addEventListener('pagehide', onPageHide)
		document.addEventListener('visibilitychange', onVisibilityChange)
		flush.current = flushPendingWrites

		return () => {
			unsubscribe()
			window.removeEventListener('pagehide', onPageHide)
			document.removeEventListener('visibilitychange', onVisibilityChange)
			flushPendingWrites()
			flush.current = () => {}
		}
	}, [editor, client, pageId, userId, ownerTag, readOnly])

	return { recentLocalUpdates, blockStates, flush }
}

// ── RTDB changes → Editor (subscription-based) ──

export function useRtdbToEditor(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	pageId: string | undefined,
	userId: string | undefined,
	ownerTag: string | undefined,
	recentLocalUpdates: React.RefObject<Set<string>>,
	blockStates: React.RefObject<Map<string, BlockState>>,
	onLock?: (event: ChangeEvent) => void
) {
	useEffect(() => {
		if (!editor || !client || !pageId || !userId) return

		const unsub = client
			.collection('b')
			.where('p', '==', pageId)
			.onSnapshot(
				(snapshot: QuerySnapshot) => {
					const changes = snapshot.docChanges()

					for (const change of changes) {
						// Handle deletes first — data is null for removed events
						if (change.type === 'removed') {
							const existing = editor.getBlock(change.doc.id)
							if (existing) {
								try {
									editor.transact((tr) => {
										tr.setMeta('y-sync$', { isChangeOrigin: true })
										editor.removeBlocks([change.doc.id])
									})
								} catch (err) {
									console.error('[useRtdbToEditor] Failed to remove block:', err)
								}
							}
							blockStates.current?.delete(change.doc.id)
							continue
						}

						// An unreadable block is left alone in the editor rather than
						// applied as a change: whatever is on screen is closer to
						// the truth than a block this build cannot read.
						const stored = decodeStoredBlock(change.doc.data(), change.doc.id)
						if (!stored) continue
						const record = fromStoredBlock(stored, ownerTag)

						// Echo suppression: skip our own recent changes
						if (
							record.updatedBy === userId &&
							recentLocalUpdates.current?.has(change.doc.id)
						) {
							continue
						}

						// Skip corrupted table blocks (stored without content)
						if (!hasValidContent(record)) continue

						if (change.type === 'modified') {
							const existing = editor.getBlock(change.doc.id)
							if (!existing) continue

							// Only apply if content actually differs
							const newContent = record.content || []
							const newProps = record.props || {}
							const existingContent = existing.content || []
							const existingProps = existing.props || {}

							if (
								JSON.stringify(newContent) !== JSON.stringify(existingContent) ||
								JSON.stringify(newProps) !== JSON.stringify(existingProps) ||
								existing.type !== record.type
							) {
								try {
									editor.transact((tr) => {
										tr.setMeta('y-sync$', { isChangeOrigin: true })
										editor.updateBlock(change.doc.id, {
											type: asBlockType(record.type),
											props: asBlockProps(record.props),
											content: asBlockContent(record.content)
										})
									})
								} catch (err) {
									console.error('[useRtdbToEditor] Failed to update block:', err)
								}
								const postState = getBlockState(editor, change.doc.id, record.order)
								if (postState) blockStates.current?.set(change.doc.id, postState)
							}
						} else if (change.type === 'added') {
							// Remote insert: only apply if block doesn't already exist locally
							const existing = editor.getBlock(change.doc.id)
							if (!existing) {
								// Insert at the end of the document for now
								// A more sophisticated approach would use parentBlockId and order
								const newBlock = {
									id: change.doc.id,
									type: asBlockType(record.type),
									props: asBlockProps(record.props),
									content: asBlockContent(record.content),
									children: []
								}
								const lastBlock = editor.document[editor.document.length - 1]
								try {
									editor.transact((tr) => {
										tr.setMeta('y-sync$', { isChangeOrigin: true })
										if (lastBlock) {
											editor.insertBlocks([newBlock], lastBlock, 'after')
										} else {
											// Nothing to anchor against. BlockNote's schema keeps
											// at least one top-level block, so an empty document
											// should be unreachable — but `added` never repeats,
											// so a block dropped here would be lost for good.
											editor.replaceBlocks(editor.document, [newBlock])
										}
									})
								} catch (err) {
									console.error('[useRtdbToEditor] Failed to insert block:', err)
								}
								const postState = getBlockState(editor, change.doc.id, record.order)
								if (postState) blockStates.current?.set(change.doc.id, postState)
							}
						}
					}
				},
				{
					onError: (err) => console.error('[useRtdbToEditor] Subscription error:', err),
					onLock
				}
			)

		return unsub
	}, [editor, client, pageId, userId, ownerTag, onLock])
}

// vim: ts=4
