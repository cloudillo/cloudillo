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

import { WebSocketManager } from './websocket.js'
import { CollectionReference } from './collection.js'
import {
	DocumentSnapshot,
	ChangeEvent,
	GetMessage,
	TransactionMessage,
	LockMessage,
	UnlockMessage,
	LockResult
} from './types.js'
import { DocumentSnapshotImpl, createDocumentFromEvent, normalizePath } from './utils.js'

export class DocumentReference<T = any> {
	readonly id: string

	constructor(
		private ws: WebSocketManager,
		private path: string
	) {
		const parts = normalizePath(path).split('/')
		this.id = parts[parts.length - 1]
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

		const response = await this.ws.send<any>(message)

		if (response.data === null) {
			return new DocumentSnapshotImpl<T>(this.id, false)
		}

		return new DocumentSnapshotImpl<T>(this.id, true, response.data as T)
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

	async update(data: Partial<T>): Promise<void> {
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
