// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AggregateQuery } from './aggregate-query.js'
import { DocumentReference } from './document.js'
import { Query } from './query.js'
import type {
	AggregateOptions,
	QuerySnapshot,
	SnapshotOptions,
	TransactionMessage,
	WhereFilterOp
} from './types.js'
import { normalizePath } from './utils.js'
import type { WebSocketManager } from './websocket.js'

export class CollectionReference<T = unknown> {
	constructor(
		private ws: WebSocketManager,
		private path: string
	) {}

	getPath(): string {
		return this.path
	}

	doc(id: string): DocumentReference<T> {
		const docPath = `${this.path}/${id}`
		return new DocumentReference<T>(this.ws, docPath)
	}

	async create(data: T): Promise<DocumentReference<T>> {
		const message: TransactionMessage = {
			type: 'transaction',
			operations: [
				{
					type: 'create',
					path: normalizePath(this.path),
					data,
					ref: '$new'
				}
			]
		}

		const response = await this.ws.send<{ results: Array<{ id?: string }> }>(message)

		const newId = (response as { results: Array<{ id?: string }> }).results[0]?.id

		if (!newId) {
			throw new Error('Failed to create document: no ID returned')
		}

		return this.doc(newId)
	}

	query(): Query<T> {
		return new Query<T>(this.ws, this.path)
	}

	aggregate(fieldOrOptions: string | AggregateOptions): AggregateQuery {
		return this.query().aggregate(fieldOrOptions)
	}

	where(field: string, op: WhereFilterOp, value: unknown): Query<T> {
		return this.query().where(field, op, value)
	}

	orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query<T> {
		return this.query().orderBy(field, direction)
	}

	limit(n: number): Query<T> {
		return this.query().limit(n)
	}

	async get(): Promise<QuerySnapshot<T>> {
		return this.query().get()
	}

	onSnapshot(
		callback: (snapshot: QuerySnapshot<T>) => void,
		optionsOrOnError?: ((error: Error) => void) | SnapshotOptions
	): () => void {
		return this.query().onSnapshot(callback, optionsOrOnError)
	}
}

// vim: ts=4
