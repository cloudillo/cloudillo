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
	WhereFilterOp,
	QueryFilter,
	QuerySnapshot,
	ChangeEvent,
	SnapshotOptions,
	QueryMessage,
	AggregateOptions
} from './types.js'
import { AggregateQuery } from './aggregate-query.js'
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

	where(field: string, op: WhereFilterOp, value: any): Query<T> {
		const opMap: Record<WhereFilterOp, keyof QueryFilter> = {
			'==': 'equals',
			'!=': 'notEquals',
			'<': 'lessThan',
			'>': 'greaterThan',
			in: 'inArray',
			'not-in': 'notInArray',
			'array-contains': 'arrayContains',
			'array-contains-any': 'arrayContainsAny',
			'array-contains-all': 'arrayContainsAll'
		}

		const filterKey = opMap[op]
		if (!this.filters[filterKey]) this.filters[filterKey] = {}
		this.filters[filterKey]![field] = value

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

	aggregate(fieldOrOptions: string | AggregateOptions): AggregateQuery {
		const opts =
			typeof fieldOrOptions === 'string' ? { groupBy: fieldOrOptions } : fieldOrOptions
		return new AggregateQuery(this.ws, this.path, opts, this.filters)
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
		optionsOrOnError?: ((error: Error) => void) | SnapshotOptions
	): () => void {
		const onError =
			typeof optionsOrOnError === 'function' ? optionsOrOnError : optionsOrOnError?.onError
		const onLock = typeof optionsOrOnError === 'object' ? optionsOrOnError?.onLock : undefined

		const documentMap = new Map<string, any>()
		let ready = false

		const unsubscribe = this.ws.subscribe(
			normalizePath(this.path),
			this.filters,
			(event: ChangeEvent) => {
				if (event.action === 'ready') {
					// Initial load complete — populate from ready event's data payload
					ready = true
					const rawDocs = (event.data as Array<any>) || []
					for (const item of rawDocs) {
						const id = item.id || ''
						documentMap.set(id, item)
					}
					const documents = Array.from(documentMap.entries()).map(([id, data]) => ({
						id,
						data
					}))
					const snapshot = new QuerySnapshotImpl<T>(documents)
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
					callback(snapshot)
					return
				}

				// Forward lock/unlock events to onLock callback (regardless of ready state)
				if (event.action === 'lock' || event.action === 'unlock') {
					onLock?.(event)
					return
				}

				if (event.action === 'create' || event.action === 'update') {
					const id = event.path.split('/').pop() || ''
					documentMap.set(id, event.data)
				} else if (event.action === 'delete') {
					const id = event.path.split('/').pop() || ''
					documentMap.delete(id)
				}

				if (!ready) return // Still buffering initial docs

				// Live update — fire incremental callback
				const documents = Array.from(documentMap.entries()).map(([id, data]) => ({
					id,
					data
				}))
				const snapshot = new QuerySnapshotImpl<T>(documents)
				const doc = createDocumentFromEvent(event)
				const index = documents.findIndex((d) => d.id === doc.id)
				snapshot.setChanges([
					{
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
				])
				callback(snapshot)
			},
			onError || ((error: Error) => console.error('Subscription error:', error))
		)

		return unsubscribe
	}
}

// vim: ts=4
