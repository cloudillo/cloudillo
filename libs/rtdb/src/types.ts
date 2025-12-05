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

import * as T from '@symbion/runtype'

// ============================================================================
// Client Message Types
// ============================================================================

export interface QueryFilter {
	equals?: Record<string, any>
	// Future: greater_than, less_than, etc.
}

export interface QueryOptions {
	filter?: QueryFilter
	sort?: Array<{ field: string; ascending: boolean }>
	limit?: number
	offset?: number
}

export interface SubscriptionOptions {
	table: string
	filter?: QueryFilter
}

export interface ChangeEvent {
	action: 'create' | 'update' | 'delete'
	path: string
	data?: any
}

export interface DocumentSnapshot<T = any> {
	id: string
	exists: boolean
	data(): T | undefined
	get(field: string): any
}

export interface DocumentChange<T = any> {
	type: 'added' | 'modified' | 'removed'
	doc: DocumentSnapshot<T>
	oldIndex: number
	newIndex: number
}

export interface QuerySnapshot<T = any> {
	docs: DocumentSnapshot<T>[]
	size: number
	empty: boolean
	forEach(callback: (doc: DocumentSnapshot<T>) => void): void
	docChanges(): DocumentChange<T>[]
}

export interface RtdbClientOptions {
	dbId: string
	auth: {
		getToken: () => string | undefined | Promise<string | undefined>
	}
	serverUrl: string
	options?: {
		enableCache?: boolean
		reconnect?: boolean
		reconnectDelay?: number
		maxReconnectDelay?: number
		debug?: boolean
	}
}

// ============================================================================
// Runtime Type Validators
// ============================================================================

const tQueryFilter = T.struct({
	equals: T.optional(T.record(T.unknown))
})

export const tQueryOptions = T.struct({
	filter: T.optional(tQueryFilter),
	sort: T.optional(
		T.array(
			T.struct({
				field: T.string,
				ascending: T.boolean
			})
		)
	),
	limit: T.optional(T.number),
	offset: T.optional(T.number)
})

export const tChangeEvent = T.struct({
	action: T.union(T.literal('create'), T.literal('update'), T.literal('delete')),
	path: T.string,
	data: T.optional(T.unknown)
})

export const tServerMessage = T.taggedUnion('type')({
	queryResult: T.struct({
		type: T.literal('queryResult'),
		id: T.number,
		data: T.array(T.unknown)
	}),
	getResult: T.struct({
		type: T.literal('getResult'),
		id: T.number,
		data: T.nullable(T.unknown)
	}),
	subscribeResult: T.struct({
		type: T.literal('subscribeResult'),
		id: T.number,
		subscriptionId: T.string
	}),
	unsubscribeResult: T.struct({
		type: T.literal('unsubscribeResult'),
		id: T.number
	}),
	createIndexResult: T.struct({
		type: T.literal('createIndexResult'),
		id: T.number
	}),
	change: T.struct({
		type: T.literal('change'),
		id: T.optional(T.union(T.number, T.string)),
		subscriptionId: T.string,
		event: tChangeEvent
	}),
	transactionResult: T.struct({
		type: T.literal('transactionResult'),
		id: T.number,
		results: T.array(
			T.struct({
				ref: T.nullable(T.string),
				id: T.nullable(T.string)
			})
		)
	}),
	error: T.struct({
		type: T.literal('error'),
		id: T.optional(T.number),
		code: T.number,
		message: T.string,
		details: T.optional(T.unknown)
	}),
	pong: T.struct({
		type: T.literal('pong'),
		id: T.number
	})
})

// Client message types (what we send to server)
export type ServerMessage = any

export interface ClientMessage {
	id?: number
	type: string
	[key: string]: any
}

export interface QueryMessage extends ClientMessage {
	type: 'query'
	path: string
	filter?: QueryFilter
	sort?: Array<{ field: string; ascending: boolean }>
	limit?: number
	offset?: number
}

export interface GetMessage extends ClientMessage {
	type: 'get'
	path: string
}

export interface SubscribeMessage extends ClientMessage {
	type: 'subscribe'
	path: string
	filter?: QueryFilter
}

export interface UnsubscribeMessage extends ClientMessage {
	type: 'unsubscribe'
	subscriptionId: string
}

export interface TransactionOperation {
	type: 'create' | 'update' | 'replace' | 'delete'
	path: string
	data?: any
	ref?: string
}

export interface TransactionMessage extends ClientMessage {
	type: 'transaction'
	operations: TransactionOperation[]
}

export interface PingMessage extends ClientMessage {
	type: 'ping'
}

// vim: ts=4
