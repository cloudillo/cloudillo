// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { WebSocketManager } from './websocket.js'
import type {
	QueryFilter,
	QueryMessage,
	AggregateOptions,
	AggregateGroupEntry,
	AggregateSnapshot,
	ChangeEvent
} from './types.js'
import { normalizePath } from './utils.js'

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

	onSnapshot(
		callback: (snapshot: AggregateSnapshot) => void,
		onError?: (error: Error) => void
	): () => void {
		let latestData: AggregateGroupEntry[] = []
		let ready = false

		const filter = Object.keys(this.filters).length > 0 ? this.filters : undefined

		const unsubscribe = this.ws.subscribe(
			normalizePath(this.path),
			filter,
			(event: ChangeEvent) => {
				if (event.action === 'ready') {
					ready = true
					latestData = (event.data as AggregateGroupEntry[]) || []
					callback({
						groups: latestData,
						size: latestData.length,
						empty: latestData.length === 0
					})
					return
				}

				if (!ready) return

				if (event.action === 'update') {
					const changedGroups = (event.data as AggregateGroupEntry[]) || []
					for (const changed of changedGroups) {
						const idx = latestData.findIndex((g) => g.group === changed.group)
						if (idx >= 0) {
							latestData[idx] = changed
						} else {
							latestData.push(changed)
						}
					}
				}

				callback({
					groups: latestData,
					size: latestData.length,
					empty: latestData.length === 0
				})
			},
			onError || ((error: Error) => console.error('Aggregate subscription error:', error)),
			this.aggregateOptions
		)

		return unsubscribe
	}
}

// vim: ts=4
