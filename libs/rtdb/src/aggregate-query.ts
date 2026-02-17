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

		const response = await this.ws.send<any>(message)

		const groups: AggregateGroupEntry[] = response.data || []
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
