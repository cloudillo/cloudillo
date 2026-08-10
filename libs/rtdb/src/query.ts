// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { AggregateQuery } from './aggregate-query.js'
import type {
	AggregateOptions,
	ChangeEvent,
	DocumentChange,
	DocumentSnapshot,
	QueryFilter,
	QueryMessage,
	QuerySnapshot,
	SnapshotOptions,
	WhereFilterOp
} from './types.js'
import { createDocumentFromEvent, normalizePath, QuerySnapshotImpl } from './utils.js'
import type { WebSocketManager } from './websocket.js'

export class Query<T = unknown> {
	private filters: QueryFilter = {}
	private sortFields: Array<{ field: string; ascending: boolean }> = []
	private limitValue?: number
	private offsetValue?: number
	private selectFields?: string[]

	constructor(
		private ws: WebSocketManager,
		private path: string
	) {}

	where(field: string, op: WhereFilterOp, value: unknown): Query<T> {
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

	/** Copy of this builder, so `select` can narrow the type without mutating. */
	private clone(): Query<T> {
		const copy = new Query<T>(this.ws, this.path)
		// The per-op records are nested one level deep: a shallow copy would share
		// them, and a later `where` on either query would show up in the other.
		copy.filters = Object.fromEntries(
			Object.entries(this.filters).map(([op, fields]) => [op, { ...fields }])
		) as QueryFilter
		copy.sortFields = this.sortFields.slice()
		copy.limitValue = this.limitValue
		copy.offsetValue = this.offsetValue
		copy.selectFields = this.selectFields?.slice()
		return copy
	}

	/**
	 * Return only these top-level fields, plus `id`, which always comes back.
	 *
	 * Returns a **new** query; the receiver keeps returning whole documents. The one
	 * builder method that does not mutate in place, because it is the only one that
	 * narrows `T`: projecting the shared instance would leave every other reference
	 * typed `Query<T>` while receiving `Partial<T>` documents.
	 *
	 * The projection is applied server-side after filtering and sorting, so
	 * `.where()` and `.orderBy()` may still reference fields left out here. On a
	 * subscription it also gates delivery: a write touching none of the selected
	 * fields is not sent at all.
	 *
	 * A server predating this option ignores it and returns whole documents, so the
	 * result is a superset rather than an error — never rely on a field being absent.
	 */
	select(...fields: string[]): Query<Partial<T>> {
		const copy = this.clone()
		copy.selectFields = fields
		return copy as unknown as Query<Partial<T>>
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

		if (this.selectFields?.length) {
			message.select = this.selectFields
		}

		const response = await this.ws.send<{ data: Array<Record<string, unknown>> }>(message)

		const documents = ((response as { data: Array<Record<string, unknown>> }).data || []).map(
			(item: Record<string, unknown>) => ({
				id: String(item.id || ''),
				data: item as unknown
			})
		)

		return new QuerySnapshotImpl<T>(documents as Array<{ id: string; data: unknown }>)
	}

	onSnapshot(
		callback: (snapshot: QuerySnapshot<T>) => void,
		optionsOrOnError?: ((error: Error) => void) | SnapshotOptions
	): () => void {
		const onError =
			typeof optionsOrOnError === 'function' ? optionsOrOnError : optionsOrOnError?.onError
		const onLock = typeof optionsOrOnError === 'object' ? optionsOrOnError?.onLock : undefined

		const documentMap = new Map<string, unknown>()
		let ready = false

		const unsubscribe = this.ws.subscribe(
			normalizePath(this.path),
			this.filters,
			(event: ChangeEvent) => {
				if (event.action === 'ready') {
					// Initial load complete — populate from ready event's data payload
					ready = true
					// `ready` carries the complete result set, and a reconnect replays
					// it, so anything still in the map the server no longer reports was
					// deleted while we were disconnected — keeping it would resurrect
					// it. Consumers tracking state from `docChanges()` alone (see
					// apps/notillo/src/hooks/useEditorSync.ts) need that deletion
					// reported, so the replay is diffed against the previous contents
					// rather than announced as all-added. On the first `ready` the
					// previous map is empty and every document is 'added'.
					const prevEntries = Array.from(documentMap.entries())
					const prevIndex = new Map(prevEntries.map(([id], i) => [id, i]))
					documentMap.clear()
					const rawDocs = (event.data as Array<Record<string, unknown>>) || []
					for (const item of rawDocs) {
						const id = String(item.id || '')
						documentMap.set(id, item)
					}
					const documents = Array.from(documentMap.entries()).map(([id, data]) => ({
						id,
						data
					}))
					const snapshot = new QuerySnapshotImpl<T>(documents)
					const changes: Array<DocumentChange<T>> = documents.map((doc, index) => {
						const oldIndex = prevIndex.get(doc.id) ?? -1
						return {
							// Emitted unconditionally for survivors: consumers
							// short-circuit on identical content, so a redundant
							// 'modified' is cheaper than missing an update that landed
							// while we were disconnected.
							type: oldIndex < 0 ? 'added' : 'modified',
							doc: createDocumentFromEvent({
								action: oldIndex < 0 ? 'create' : 'update',
								path: `${this.path}/${doc.id}`,
								data: doc.data
							}),
							oldIndex,
							newIndex: index
						} as DocumentChange<T>
					})
					// Appended after the survivors. Consumers that care about deletions
					// handle `'removed'` first regardless of position.
					prevEntries.forEach(([id, data], i) => {
						if (documentMap.has(id)) return
						changes.push({
							type: 'removed',
							doc: createDocumentFromEvent({
								action: 'delete',
								path: `${this.path}/${id}`,
								data
							}),
							oldIndex: i,
							newIndex: -1
						} as DocumentChange<T>)
					})
					snapshot.setChanges(changes)
					callback(snapshot)
					return
				}

				// Forward lock/unlock events to onLock callback (regardless of ready state)
				if (event.action === 'lock' || event.action === 'unlock') {
					onLock?.(event)
					return
				}

				if (!ready) return // Still buffering initial docs

				if (event.action === 'create' || event.action === 'update') {
					const id = event.path.split('/').pop() || ''
					documentMap.set(id, event.data)
				} else if (event.action === 'delete') {
					const id = event.path.split('/').pop() || ''
					documentMap.delete(id)
				}

				// Live update — fire incremental callback
				const documents = Array.from(documentMap.entries()).map(([id, data]) => ({
					id,
					data
				}))
				const snapshot = new QuerySnapshotImpl<T>(documents)
				const doc = createDocumentFromEvent(event) as DocumentSnapshot<T>
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
			onError || ((error: Error) => console.error('Subscription error:', error)),
			undefined,
			this.selectFields?.length ? this.selectFields : undefined
		)

		return unsubscribe
	}
}

// vim: ts=4
