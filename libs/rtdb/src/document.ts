// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { WebSocketManager } from './websocket.js'
import { CollectionReference } from './collection.js'
import type {
	DocumentSnapshot,
	ChangeEvent,
	GetMessage,
	TransactionMessage,
	LockMessage,
	UnlockMessage,
	LockResult,
	UpdateData
} from './types.js'
import { DocumentSnapshotImpl, createDocumentFromEvent, normalizePath } from './utils.js'

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

	onSnapshot(
		callback: (snapshot: DocumentSnapshot<T>) => void,
		onError?: (error: Error) => void
	): () => void {
		let lastSnapshot: DocumentSnapshot<T> | null = null
		let bufferedSnapshot: DocumentSnapshot<T> | null = null
		let ready = false

		const unsubscribe = this.ws.subscribe(
			normalizePath(this.path),
			undefined,
			(event: ChangeEvent) => {
				if (event.action === 'ready') {
					ready = true
					// Fire buffered or empty snapshot
					const snapshot = bufferedSnapshot || new DocumentSnapshotImpl<T>(this.id, false)
					lastSnapshot = snapshot
					callback(snapshot)
					return
				}

				const snapshot = createDocumentFromEvent(event) as DocumentSnapshot<T>

				if (!ready) {
					bufferedSnapshot = snapshot
					return
				}

				// Only call callback if data actually changed
				if (
					lastSnapshot === null ||
					lastSnapshot.exists !== snapshot.exists ||
					JSON.stringify(lastSnapshot.data()) !== JSON.stringify(snapshot.data())
				) {
					lastSnapshot = snapshot
					callback(snapshot)
				}
			},
			onError || ((error: Error) => console.error('Subscription error:', error))
		)

		return unsubscribe
	}
}

// vim: ts=4
