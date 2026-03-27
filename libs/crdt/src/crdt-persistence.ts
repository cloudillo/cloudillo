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
 * CRDT Document Offline Persistence
 *
 * Stores incremental Yjs updates via the shell's encrypted cache for
 * near-zero data loss. Mirrors y-indexeddb's approach: each update is
 * persisted immediately as a separate log entry, with periodic compaction.
 */

import * as Y from 'yjs'
import type { AppMessageBus } from '@cloudillo/core'

const COMPACT_THRESHOLD = 300

export class CrdtPersistence {
	private updateCount = 0
	private listening = false

	constructor(
		private bus: AppMessageBus,
		private docId: string,
		private yDoc: Y.Doc
	) {}

	/** Load cached state from shell storage. Returns true if cache existed. */
	async loadCached(): Promise<boolean> {
		const updates = await this.bus.crdtCacheRead(this.docId)
		if (!updates || updates.length === 0) return false

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
		this.compact() // Snapshot the post-sync state (includes server data)
		this.yDoc.on('update', this.handleUpdate)
	}

	private handleUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === this) return

		// Extract current clock for our clientId
		const sv = Y.encodeStateVector(this.yDoc)
		const decoded = Y.decodeStateVector(sv)
		const clock = decoded.get(this.yDoc.clientID) ?? 0

		this.bus.crdtCacheAppend(this.docId, update, this.yDoc.clientID, clock).catch((err) => {
			console.error('[CRDT] Failed to persist update:', err)
		})
		if (++this.updateCount >= COMPACT_THRESHOLD) {
			this.compact()
		}
	}

	private compact(clearDirty?: boolean): void {
		const state = Y.encodeStateAsUpdate(this.yDoc)
		this.bus
			.crdtCacheCompact(this.docId, state, clearDirty)
			.then(() => {
				this.updateCount = 0
			})
			.catch((err) => {
				console.error('[CRDT] Failed to compact cache:', err)
			})
	}

	/** Re-compact after an online sync merges server state with cached offline state */
	recompact(): void {
		this.compact(true)
	}

	destroy(): void {
		if (this.listening) {
			this.yDoc.off('update', this.handleUpdate)
			this.compact()
			this.listening = false
		}
	}
}

// vim: ts=4
