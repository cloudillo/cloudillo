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
import { DocumentReference } from './document.js'
import { Query } from './query.js'
import { QuerySnapshot, TransactionMessage } from './types.js'
import { normalizePath } from './utils.js'

export class CollectionReference<T = any> {
	constructor(
		private ws: WebSocketManager,
		private path: string
	) {}

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

		const response = await this.ws.send<any>(message)

		const newId = response.results[0]?.id

		if (!newId) {
			throw new Error('Failed to create document: no ID returned')
		}

		return this.doc(newId)
	}

	query(): Query<T> {
		return new Query<T>(this.ws, this.path)
	}

	where(field: string, op: string, value: any): Query<T> {
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
		onError?: (error: Error) => void
	): () => void {
		return this.query().onSnapshot(callback, onError)
	}
}

// vim: ts=4
