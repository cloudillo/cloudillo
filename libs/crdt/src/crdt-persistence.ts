// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRDT Document Offline Persistence
 *
 * Stores incremental Yjs updates via the shell's encrypted cache for
 * near-zero data loss. Mirrors y-indexeddb's approach: each update is
 * persisted immediately as a separate log entry, with periodic compaction.
 */

import type { AppMessageBus } from '@cloudillo/core'
import * as Y from 'yjs'

const COMPACT_THRESHOLD = 300

export class CrdtPersistence {
	private updateCount = 0
	private listening = false
	private wsSynced = false

	constructor(
		private bus: AppMessageBus,
		private docId: string,
		private yDoc: Y.Doc
	) {}

	/**
	 * Signal that the websocket has reached a synced state. Cached updates
	 * are now on the server, so we can clear the dirty flag. Called from
	 * crdt.ts on the WS 'sync' event (both initial sync and reconnect-sync).
	 */
	markSynced(): void {
		const wasOffline = !this.wsSynced
		this.wsSynced = true
		// Piggy-back the dirty-clear onto compact(true) — it needs the most
		// recent state anyway. Only fires on the offline→online transition;
		// subsequent 'sync' events after a brief flicker are no-ops.
		if (wasOffline) void this.compact(true)
	}

	/** Signal that the websocket has disconnected — subsequent updates count as offline. */
	markDisconnected(): void {
		this.wsSynced = false
	}

	/** Load cached state from shell storage. Returns true if cache existed. */
	async loadCached(): Promise<boolean> {
		const updates = await this.bus.crdtCacheRead(this.docId)
		if (!updates || updates.length === 0) return false

		// Yield to the browser event loop so Chrome's 'message' handler
		// measurement completes before expensive Y.js processing.
		await new Promise<void>((resolve) => setTimeout(resolve, 0))

		Y.transact(
			this.yDoc,
			() => {
				for (const update of updates) {
					Y.applyUpdate(this.yDoc, update)
				}
			},
			this,
			false
		)
		this.updateCount = updates.length
		return true
	}

	/** Start listening for doc updates and persisting them. Call after WS sync. */
	startPersisting(): void {
		if (this.listening) return
		this.listening = true
		// Snapshot the post-sync state and clear any stale :dirty flag from
		// previous sessions. Skip when markSynced() has already compacted on
		// the offline→online edge — its compact(true) covers the same work.
		if (!this.wsSynced) void this.compact(true)
		this.yDoc.on('update', this.handleUpdate)
	}

	private handleUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === this) return

		// Extract current clock for our clientId
		const sv = Y.encodeStateVector(this.yDoc)
		const decoded = Y.decodeStateVector(sv)
		const clock = decoded.get(this.yDoc.clientID) ?? 0

		this.bus
			.crdtCacheAppend(this.docId, update, this.yDoc.clientID, clock, !this.wsSynced)
			.catch((err) => {
				console.error('[CRDT] Failed to persist update:', err)
			})
		if (++this.updateCount >= COMPACT_THRESHOLD) {
			void this.compact()
		}
	}

	private async compact(clearDirty?: boolean): Promise<void> {
		const state = Y.encodeStateAsUpdate(this.yDoc)
		try {
			await this.bus.crdtCacheCompact(this.docId, state, clearDirty)
			this.updateCount = 0
		} catch (err) {
			console.error('[CRDT] Failed to compact cache:', err)
		}
	}

	/**
	 * Stop persisting and flush a final compact. Returns a Promise so callers
	 * that want flush-on-leave semantics (visibilitychange / beforeunload)
	 * can await the IPC round-trip; React effect cleanups can fire-and-
	 * forget via `void persistence.destroy()`.
	 */
	async destroy(): Promise<void> {
		if (this.listening) {
			this.yDoc.off('update', this.handleUpdate)
			this.listening = false
			await this.compact()
		}
	}
}

// vim: ts=4
