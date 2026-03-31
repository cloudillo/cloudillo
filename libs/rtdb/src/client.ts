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
import { DocumentReference } from './document.js'
import type {
	RtdbClientOptions,
	TransactionMessage,
	TransactionOperation,
	UpdateData
} from './types.js'
import { normalizePath } from './utils.js'

export interface BatchResult {
	ref: string | null
	id: string | null
}

export class WriteBatch {
	private operations: TransactionOperation[] = []

	constructor(private ws: WebSocketManager) {}

	create<T>(
		ref: CollectionReference<T> | DocumentReference<T>,
		data: T,
		options?: { ref?: string }
	): DocumentReference<T> {
		const path = ref.getPath()

		this.operations.push({
			type: 'create',
			path: normalizePath(path),
			data,
			ref: options?.ref
		})

		// Return a placeholder document reference
		// The actual ID will be known after commit
		return ref instanceof DocumentReference ? ref : ref.doc('$placeholder')
	}

	set<T>(ref: DocumentReference<T>, data: T): void {
		const path = ref.getPath()

		this.operations.push({
			type: 'replace',
			path: normalizePath(path),
			data
		})
	}

	update<T>(ref: DocumentReference<T>, data: UpdateData<T>): void {
		const path = ref.getPath()

		this.operations.push({
			type: 'update',
			path: normalizePath(path),
			data
		})
	}

	delete<T>(ref: DocumentReference<T>): void {
		const path = ref.getPath()

		this.operations.push({
			type: 'delete',
			path: normalizePath(path)
		})
	}

	async commit(): Promise<BatchResult[]> {
		const message: TransactionMessage = {
			type: 'transaction',
			operations: this.operations
		}

		const response = await this.ws.send<{ results: BatchResult[] }>(message)

		return (response as { results: BatchResult[] }).results || []
	}
}

export class RtdbClient {
	private ws: WebSocketManager
	private connected = false

	constructor(private options: RtdbClientOptions) {
		const defaultOptions = {
			enableCache: false,
			reconnect: true,
			reconnectDelay: 1000,
			maxReconnectDelay: 30000,
			debug: false
		}

		const mergedOptions = {
			...defaultOptions,
			...options.options
		}

		this.ws = new WebSocketManager(
			options.dbId,
			options.auth.getToken,
			options.serverUrl,
			mergedOptions
		)
	}

	async connect(): Promise<void> {
		if (this.connected) return

		await this.ws.connect()
		this.connected = true
	}

	async disconnect(): Promise<void> {
		if (!this.connected) return

		await this.ws.disconnect()
		this.connected = false
	}

	collection<T = unknown>(path: string): CollectionReference<T> {
		// Auto-connect on first operation
		if (!this.connected) {
			this.connect().catch((error) => {
				console.error('Failed to connect to RTDB:', error)
			})
		}

		return new CollectionReference<T>(this.ws, path)
	}

	ref<T = unknown>(path: string): DocumentReference<T> {
		// Auto-connect on first operation
		if (!this.connected) {
			this.connect().catch((error) => {
				console.error('Failed to connect to RTDB:', error)
			})
		}

		return new DocumentReference<T>(this.ws, path)
	}

	batch(): WriteBatch {
		return new WriteBatch(this.ws)
	}

	async createIndex(collectionPath: string, field: string): Promise<void> {
		const message = {
			type: 'createIndex',
			path: normalizePath(collectionPath),
			field
		}

		await this.ws.send(message)
	}

	// Utility methods for diagnostics
	isConnected(): boolean {
		return this.connected && this.ws.isConnected()
	}

	getPendingRequests(): number {
		return this.ws.getPendingRequestCount()
	}

	getActiveSubscriptions(): number {
		return this.ws.getSubscriptionCount()
	}
}

export function createRtdbClient(options: RtdbClientOptions): RtdbClient {
	return new RtdbClient(options)
}

// vim: ts=4
