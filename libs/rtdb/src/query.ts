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
import {
	QueryFilter,
	QuerySnapshot,
	ChangeEvent,
	QueryMessage
} from './types.js'
import { QuerySnapshotImpl, createDocumentFromEvent, normalizePath } from './utils.js'

export class Query<T = any> {
	private filters: QueryFilter = {}
	private sortFields: Array<{ field: string; ascending: boolean }> = []
	private limitValue?: number
	private offsetValue?: number

	constructor(
		private ws: WebSocketManager,
		private path: string
	) {}

	where(field: string, op: string, value: any): Query<T> {
		if (op !== '==') {
			throw new Error(`Operator "${op}" not yet supported. Currently only "==" is supported.`)
		}

		if (!this.filters.equals) {
			this.filters.equals = {}
		}

		this.filters.equals[field] = value

		return this
	}

	orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query<T> {
		this.sortFields.push({
			field,
			ascending: direction === 'asc'
		})
		return this
	}

	limit(n: number): Query<T> {
		this.limitValue = n
		return this
	}

	offset(n: number): Query<T> {
		this.offsetValue = n
		return this
	}

	async get(): Promise<QuerySnapshot<T>> {
		const message: QueryMessage = {
			type: 'query',
			path: normalizePath(this.path)
		}

		if (Object.keys(this.filters).length > 0) {
			message.filter = this.filters
		}

		if (this.sortFields.length > 0) {
			message.sort = this.sortFields
		}

		if (this.limitValue !== undefined) {
			message.limit = this.limitValue
		}

		if (this.offsetValue !== undefined) {
			message.offset = this.offsetValue
		}

		const response = await this.ws.send<any>(message)

		const documents = (response.data || []).map((item: any) => ({
			id: item.id || '',
			data: item
		}))

		return new QuerySnapshotImpl<T>(documents)
	}

	onSnapshot(
		callback: (snapshot: QuerySnapshot<T>) => void,
		onError?: (error: Error) => void
	): () => void {
		// Track documents by ID for detecting changes
		const documentMap = new Map<string, any>()
		let initialSnapshot = true

		const unsubscribe = this.ws.subscribe(
			normalizePath(this.path),
			this.filters,
			(event: ChangeEvent) => {
				const id = event.path.split('/').pop() || ''

				if (event.action === 'create' || event.action === 'update') {
					documentMap.set(id, event.data)
				} else if (event.action === 'delete') {
					documentMap.delete(id)
				}

				// Create snapshot from current documents
				const documents = Array.from(documentMap.entries()).map(([id, data]) => ({
					id,
					data
				}))

				const snapshot = new QuerySnapshotImpl<T>(documents)

				// For initial snapshot, return all documents as added
				if (initialSnapshot) {
					const changes = documents.map((doc, index) => ({
						type: 'added' as const,
						doc: createDocumentFromEvent({
							action: 'create',
							path: `${this.path}/${doc.id}`,
							data: doc.data
						}),
						oldIndex: -1,
						newIndex: index
					}))
					snapshot.setChanges(changes)
					initialSnapshot = false
				} else {
					// For updates, determine change type
					const doc = createDocumentFromEvent(event)
					const index = documents.findIndex((d) => d.id === doc.id)

					const change: any = {
						type:
							event.action === 'create'
								? 'added'
								: event.action === 'delete'
									? 'removed'
									: 'modified',
						doc,
						oldIndex: event.action === 'delete' ? index : -1,
						newIndex: event.action === 'delete' ? -1 : index
					}

					snapshot.setChanges([change])
				}

				callback(snapshot)
			},
			onError || ((error: Error) => console.error('Subscription error:', error))
		)

		return unsubscribe
	}
}

// vim: ts=4
