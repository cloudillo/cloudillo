// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { CollectionReference } from './collection.js'
import type {
	ChangeEvent,
	DocumentSnapshot,
	GetMessage,
	LockMessage,
	LockResult,
	TransactionMessage,
	UnlockMessage,
	UpdateData
} from './types.js'
import { createDocumentFromEvent, DocumentSnapshotImpl, normalizePath } from './utils.js'
import type { WebSocketManager } from './websocket.js'

export class DocumentReference<T = unknown> {
	readonly id: string

	constructor(
		private ws: WebSocketManager,
		private path: string
	) {
		const parts = normalizePath(path).split('/')
		this.id = parts[parts.length - 1]
	}

	getPath(): string {
		return this.path
	}

	collection(name: string): CollectionReference {
		const subPath = `${this.path}/${name}`
		return new CollectionReference(this.ws, subPath)
	}

	async get(): Promise<DocumentSnapshot<T>> {
		const message: GetMessage = {
			type: 'get',
			path: normalizePath(this.path)
		}

		const response = await this.ws.send<{ data: unknown }>(message)

		if ((response as { data: unknown }).data === null) {
			return new DocumentSnapshotImpl<T>(this.id, false)
		}

		return new DocumentSnapshotImpl<T>(this.id, true, (response as { data: unknown }).data as T)
	}

	async set(data: T): Promise<void> {
		const message: TransactionMessage = {
			type: 'transaction',
			operations: [
				{
					type: 'replace',
					path: normalizePath(this.path),
					data
				}
			]
		}

		await this.ws.send(message)
	}

	async update(data: UpdateData<T>): Promise<void> {
		const message: TransactionMessage = {
			type: 'transaction',
			operations: [
				{
					type: 'update',
					path: normalizePath(this.path),
					data
				}
			]
		}

		await this.ws.send(message)
	}

	async delete(): Promise<void> {
		const message: TransactionMessage = {
			type: 'transaction',
			operations: [
				{
					type: 'delete',
					path: normalizePath(this.path)
				}
			]
		}

		await this.ws.send(message)
	}

	async lock(mode: 'soft' | 'hard' = 'soft'): Promise<LockResult> {
		const message: LockMessage = {
			type: 'lock',
			path: normalizePath(this.path),
			mode
		}
		return this.ws.send<LockResult>(message)
	}

	async unlock(): Promise<void> {
		const message: UnlockMessage = {
			type: 'unlock',
			path: normalizePath(this.path)
		}
		await this.ws.send(message)
	}

	/**
	 * Watch this one document.
	 *
	 * The subscription is self-contained: `ready` carries the document's current
	 * value, so the first callback is the value and not a placeholder, and no
	 * separate read is needed. That takes the `'document'` scope below — without
	 * it the server resolves the path as a collection and builds the replay by
	 * scanning the keys *under* it, which structurally cannot include the document
	 * stored at the path itself, so `ready` arrived empty however long the
	 * document had existed and the first snapshot read as "no such document" —
	 * a different fact from "not loaded", and the wrong one.
	 *
	 * `ready.data` holds the whole initial result set, which at this scope is zero
	 * or one document: present means the document exists, empty means it does not.
	 * A reconnect re-subscribes and replays `ready` with whatever is stored at that
	 * moment, so a write that landed while the socket was down needs no separate
	 * read either — and the comparison below suppresses the replay when nothing
	 * moved.
	 */
	onSnapshot(
		callback: (snapshot: DocumentSnapshot<T>) => void,
		onError?: (error: Error) => void
	): () => void {
		let lastSnapshot: DocumentSnapshot<T> | null = null
		// A change that lands before `ready` is buffered rather than emitted. The
		// server builds `ready` from the state at *subscribe* time, so emitting the
		// change first hands the caller new state and then old, and `emit`'s only
		// guard is "differs from the last one" — no correction event follows. Held
		// and flushed after `ready`, the caller moves old → new instead, and the
		// dedupe collapses the pair when they agree.
		// Only the *first* `ready` gates this: a reconnect replay is itself fresh
		// and authoritative, and must pass straight through.
		// ponytail: a change racing a reconnect `ready` is still last-write-wins;
		// fixing that needs a per-event sequence number from the server.
		let readySeen = false
		let pending: DocumentSnapshot<T>[] = []

		const emit = (snapshot: DocumentSnapshot<T>) => {
			// Only call callback if data actually changed
			if (
				lastSnapshot === null ||
				lastSnapshot.exists !== snapshot.exists ||
				JSON.stringify(lastSnapshot.data()) !== JSON.stringify(snapshot.data())
			) {
				lastSnapshot = snapshot
				callback(snapshot)
			}
		}

		return this.ws.subscribe(
			normalizePath(this.path),
			undefined,
			(event: ChangeEvent) => {
				if (event.action === 'ready') {
					const docs = (event.data as Array<Record<string, unknown>>) || []
					const doc = docs[0]
					emit(
						doc
							? new DocumentSnapshotImpl<T>(this.id, true, doc as T)
							: new DocumentSnapshotImpl<T>(this.id, false)
					)
					readySeen = true
					const buffered = pending
					pending = []
					for (const snapshot of buffered) emit(snapshot)
					return
				}

				// A lock payload is `{ userId, mode, connId }` — lock state, not
				// document fields. `createDocumentFromEvent` would wrap it as a
				// snapshot, the comparison above would see it differ from the real
				// document, and the caller would be handed lock metadata as if
				// someone had rewritten the record. `DocumentReference` has no
				// `onLock` option the way `Query.onSnapshot` does, so drop them.
				if (event.action === 'lock' || event.action === 'unlock') return

				const snapshot = createDocumentFromEvent(event) as DocumentSnapshot<T>
				if (!readySeen) pending.push(snapshot)
				else emit(snapshot)
			},
			onError || ((error: Error) => console.error('Subscription error:', error)),
			undefined,
			undefined,
			'document'
		)
	}
}

// vim: ts=4
