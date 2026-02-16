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

import { useEffect, useRef } from 'react'

import type { Block, BlockNoteEditor } from '@blocknote/core'
import type { RtdbClient, QuerySnapshot, ChangeEvent } from '@cloudillo/rtdb'
import type { StoredBlockRecord } from '../rtdb/types.js'
import { toStoredBlock, fromStoredBlock } from '../rtdb/transform.js'
import { getBlockOrder } from '../rtdb/block-ops.js'

const DEBOUNCE_MS = 300
const ECHO_SUPPRESS_MS = 2000

// ── Per-block state tracking ──

interface BlockState {
	type: string
	props: Record<string, any>
	content: any[]
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
		type: block.type,
		props: block.props ?? {},
		content: (block.content as any[]) ?? [],
		parentBlockId: editor.getParentBlock(block)?.id ?? null,
		order: storedOrder ?? getBlockOrder(editor, blockId)
	}
}

interface PatchResult {
	patch: Record<string, any>
	debounce: boolean // true = content-only change, should debounce
}

function buildPartialUpdate(
	prev: BlockState,
	curr: BlockState,
	pageId: string,
	now: string,
	userId: string
): PatchResult | null {
	const patch: Record<string, any> = {}
	let hasDiscreteChange = false

	if (curr.type !== prev.type) {
		patch.t = curr.type
		hasDiscreteChange = true
	}
	if (JSON.stringify(curr.props) !== JSON.stringify(prev.props)) {
		patch.pr = curr.props
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
	patch.ub = userId

	// Debounce only when JUST content changed (typing). If any discrete field
	// also changed (type, props, position), send everything immediately.
	return { patch, debounce: !hasDiscreteChange && 'c' in patch }
}

function buildFullStoredBlock(
	editor: BlockNoteEditor,
	blockId: string,
	pageId: string,
	userId: string,
	now: string,
	order: number
): StoredBlockRecord | null {
	const block = editor.getBlock(blockId)
	if (!block) return null

	const parentBlockId = editor.getParentBlock(block)?.id ?? null

	return toStoredBlock({
		pageId,
		type: block.type,
		...(block.props && Object.keys(block.props).length > 0 && { props: block.props }),
		...(block.content &&
			Array.isArray(block.content) &&
			block.content.length > 0 && { content: block.content as any }),
		parentBlockId,
		order,
		updatedAt: now,
		updatedBy: userId
	})
}

// ── Local changes → RTDB (smart per-block sync) ──

export interface DocumentSyncResult {
	recentLocalUpdates: React.RefObject<Set<string>>
	blockStates: React.RefObject<Map<string, BlockState>>
}

export function useDocumentSync(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	pageId: string | undefined,
	userId: string | undefined,
	readOnly: boolean,
	knownBlockIds: Set<string>,
	knownBlockOrders: Map<string, number>
): DocumentSyncResult {
	const blockStates = useRef(new Map<string, BlockState>())
	const blockIdList = useRef<string[]>([])
	const pendingDebounces = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	const recentLocalUpdates = useRef(new Set<string>())

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
			const stored = buildFullStoredBlock(editor, id, pageId, userId, now, order)
			if (stored) {
				markLocal(id)
				client.collection('b').doc(id).set(stored).catch(console.error)
			}
		}

		function markLocal(blockId: string) {
			recentLocalUpdates.current.add(blockId)
			setTimeout(() => recentLocalUpdates.current.delete(blockId), ECHO_SUPPRESS_MS)
		}

		function sendUpdate(blockId: string, patch: Record<string, any>) {
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
				clearTimeout(existing)
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
				userId!
			)

			// Handle order patch when newOrder is explicitly provided
			if (newOrder !== undefined) {
				if (!result) {
					// Only order changed — create minimal patch
					const patch: Record<string, any> = {
						o: newOrder,
						p: pageId,
						ua: new Date().toISOString(),
						ub: userId
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

			if (!result) return

			if (result.debounce && !immediate) {
				// Per-block debounce for content-only changes
				clearBlockDebounce(blockId)
				pendingDebounces.current.set(
					blockId,
					setTimeout(() => {
						pendingDebounces.current.delete(blockId)
						// Re-read latest state since content may have changed during debounce
						const latest = getBlockState(editor!, blockId, prev?.order)
						if (!latest) return
						const latestResult = buildPartialUpdate(
							prev,
							latest,
							pageId!,
							new Date().toISOString(),
							userId!
						)
						if (latestResult) {
							blockStates.current.set(blockId, latest)
							sendUpdate(blockId, latestResult.patch)
						} else {
							// No further changes, send original patch
							blockStates.current.set(blockId, curr)
							sendUpdate(blockId, result.patch)
						}
					}, DEBOUNCE_MS)
				)
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

		return () => {
			unsubscribe()
			// Clear all pending debounce timers
			for (const timer of pendingDebounces.current.values()) {
				clearTimeout(timer)
			}
			pendingDebounces.current.clear()
		}
	}, [editor, client, pageId, userId, readOnly])

	return { recentLocalUpdates, blockStates }
}

// ── RTDB changes → Editor (subscription-based) ──

export function useRtdbToEditor(
	editor: BlockNoteEditor | undefined,
	client: RtdbClient | undefined,
	pageId: string | undefined,
	userId: string | undefined,
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
									editor.removeBlocks([change.doc.id])
								} catch (err) {
									console.error('[useRtdbToEditor] Failed to remove block:', err)
								}
							}
							blockStates.current?.delete(change.doc.id)
							continue
						}

						const record = fromStoredBlock(change.doc.data() as StoredBlockRecord)

						// Echo suppression: skip our own recent changes
						if (
							record.updatedBy === userId &&
							recentLocalUpdates.current?.has(change.doc.id)
						) {
							continue
						}

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
									editor.updateBlock(change.doc.id, {
										type: record.type as any,
										props: record.props as any,
										content: record.content as any
									})
									// Update blockStates to prevent echo-back on next onChange.
									// Use the RTDB record's order to preserve fractional values
									// (getBlockState without storedOrder would use index+1)
									const newState = getBlockState(
										editor,
										change.doc.id,
										record.order
									)
									if (newState) blockStates.current?.set(change.doc.id, newState)
								} catch (err) {
									console.error('[useRtdbToEditor] Failed to update block:', err)
								}
							}
						} else if (change.type === 'added') {
							// Remote insert: only apply if block doesn't already exist locally
							const existing = editor.getBlock(change.doc.id)
							if (!existing) {
								try {
									// Insert at the end of the document for now
									// A more sophisticated approach would use parentBlockId and order
									const lastBlock = editor.document[editor.document.length - 1]
									if (lastBlock) {
										editor.insertBlocks(
											[
												{
													id: change.doc.id,
													type: record.type as any,
													props: record.props as any,
													content: record.content as any,
													children: []
												}
											],
											lastBlock,
											'after'
										)
										// Update blockStates for the newly inserted block
										const newState = getBlockState(
											editor,
											change.doc.id,
											record.order
										)
										if (newState)
											blockStates.current?.set(change.doc.id, newState)
									}
								} catch (err) {
									console.error('[useRtdbToEditor] Failed to insert block:', err)
								}
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
	}, [editor, client, pageId, userId, onLock])
}

// vim: ts=4
