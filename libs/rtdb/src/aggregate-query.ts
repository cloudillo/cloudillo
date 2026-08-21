// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	AggregateGroupEntry,
	AggregateOptions,
	AggregateSnapshot,
	ChangeEvent,
	QueryFilter,
	QueryMessage,
	SnapshotOptions
} from './types.js'
import { normalizePath } from './utils.js'
import type { WebSocketManager } from './websocket.js'

export class AggregateQuery {
	constructor(
		private ws: WebSocketManager,
		private path: string,
		private aggregateOptions: AggregateOptions,
		private filters: QueryFilter = {}
	) {}

	async get(): Promise<AggregateSnapshot> {
		const message: QueryMessage = {
			type: 'query',
			path: normalizePath(this.path),
			aggregate: this.aggregateOptions
		}

		if (Object.keys(this.filters).length > 0) {
			message.filter = this.filters
		}

		const response = await this.ws.send<{ data: AggregateGroupEntry[] }>(message)

		const groups: AggregateGroupEntry[] =
			(response as { data: AggregateGroupEntry[] }).data || []
		return {
			groups,
			size: groups.length,
			empty: groups.length === 0
		}
	}

	/**
	 * Subscribe to a live group set, maintained here from the server's `ready`
	 * snapshot and subsequent `update` events.
	 *
	 * No in-repo consumer — it exists for `@cloudillo/rtdb`'s published API, and the
	 * merge/replace semantics below are asserted only by
	 * `src/__tests__/aggregate-query.test.ts`.
	 */
	onSnapshot(
		callback: (snapshot: AggregateSnapshot) => void,
		optionsOrOnError?: ((error: Error) => void) | SnapshotOptions
	): () => void {
		const onError =
			typeof optionsOrOnError === 'function' ? optionsOrOnError : optionsOrOnError?.onError
		const scope =
			(typeof optionsOrOnError === 'object' ? optionsOrOnError?.scope : undefined) ??
			'children'

		const groupMap = new Map<AggregateGroupEntry['group'], AggregateGroupEntry>()
		let ready = false

		const filter = Object.keys(this.filters).length > 0 ? this.filters : undefined

		const emit = () => {
			// Fresh array each time so consumers can compare identities
			const groups = Array.from(groupMap.values())
			callback({
				groups,
				size: groups.length,
				empty: groups.length === 0
			})
		}

		const fill = (groups: AggregateGroupEntry[]) => {
			for (const group of groups) {
				groupMap.set(group.group, group)
			}
		}

		const unsubscribe = this.ws.subscribe(
			normalizePath(this.path),
			filter,
			(event: ChangeEvent) => {
				// Both carry a complete group set rather than a delta, so both replace
				// what the map holds — anything the server no longer reports is gone,
				// and keeping it would resurrect it. They differ only in origin:
				// `ready` is the initial snapshot, replayed on every re-subscribe after
				// a reconnect; `replace` is a min/max recompute, which the server cannot
				// express as a delta because an emptied group is absent from it rather
				// than zeroed.
				if (event.action === 'ready' || event.action === 'replace') {
					ready = true
					groupMap.clear()
					fill((event.data as AggregateGroupEntry[]) || [])
					emit()
					return
				}

				// Lock events carry lock metadata, not groups, and AggregateQuery has
				// no onLock option — drop them without re-firing the callback.
				if (event.action === 'lock' || event.action === 'unlock') return

				if (!ready) return

				if (event.action !== 'update') return

				const changedGroups = (event.data as AggregateGroupEntry[]) || []
				// `update` is always a touched-groups delta — a full recompute arrives
				// as `replace` above. `count: 0` is its tombstone for a group whose
				// last document left. `Map.set` keeps an existing group in its original
				// slot; new groups append at the tail.
				for (const changed of changedGroups) {
					if (changed.count === 0) {
						groupMap.delete(changed.group)
					} else {
						groupMap.set(changed.group, changed)
					}
				}
				emit()
			},
			onError || ((error: Error) => console.error('Aggregate subscription error:', error)),
			this.aggregateOptions,
			undefined,
			// An aggregate is over a collection. Counting documents from
			// sub-collections into its groups is the same over-matching bug the
			// query path had, wearing a different hat. `{ scope: 'subtree' }` is the
			// escape hatch, the same one `Query.onSnapshot` offers, for a caller who
			// wants the any-depth behaviour every subscription had before.
			scope
		)

		return unsubscribe
	}
}

// vim: ts=4
