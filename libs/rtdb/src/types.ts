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

export type WhereFilterOp =
	| '=='
	| '!='
	| '<'
	| '>'
	| 'in'
	| 'not-in'
	| 'array-contains'
	| 'array-contains-any'
	| 'array-contains-all'

export interface QueryFilter {
	equals?: Record<string, any>
	notEquals?: Record<string, any>
	greaterThan?: Record<string, any>
	lessThan?: Record<string, any>
	inArray?: Record<string, any>
	notInArray?: Record<string, any>
	arrayContains?: Record<string, any>
	arrayContainsAny?: Record<string, any>
	arrayContainsAll?: Record<string, any>
}

export type AggregateOp = 'sum' | 'avg' | 'min' | 'max'

export interface AggregateOpDef {
	op: AggregateOp
	field: string
}

export interface AggregateOptions {
	groupBy: string
	ops?: AggregateOpDef[]
}

export interface AggregateGroupEntry {
	group: string | number | boolean
	count: number
	[key: string]: any
}

export interface AggregateSnapshot {
	groups: AggregateGroupEntry[]
	size: number
	empty: boolean
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

export interface LockEventData {
	userId: string
	mode: 'soft' | 'hard'
	connId: string
}

export interface UnlockEventData {
	userId: string
	connId: string
}

export interface ChangeEvent {
	action: 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'ready'
	path: string
	data?: any
}

export interface SnapshotOptions {
	onError?: (error: Error) => void
	onLock?: (event: ChangeEvent) => void
}

export interface LockResult {
	locked: boolean
	holder?: string
	mode?: 'soft' | 'hard'
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
	equals: T.optional(T.record(T.unknown)),
	notEquals: T.optional(T.record(T.unknown)),
	greaterThan: T.optional(T.record(T.unknown)),
	lessThan: T.optional(T.record(T.unknown)),
	inArray: T.optional(T.record(T.unknown)),
	notInArray: T.optional(T.record(T.unknown)),
	arrayContains: T.optional(T.record(T.unknown)),
	arrayContainsAny: T.optional(T.record(T.unknown)),
	arrayContainsAll: T.optional(T.record(T.unknown))
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
	action: T.union(
		T.literal('create'),
		T.literal('update'),
		T.literal('delete'),
		T.literal('lock'),
		T.literal('unlock'),
		T.literal('ready')
	),
	path: T.string,
	data: T.optional(T.nullable(T.unknown))
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
	lockResult: T.struct({
		type: T.literal('lockResult'),
		id: T.number,
		locked: T.boolean,
		holder: T.optional(T.string),
		mode: T.optional(T.union(T.literal('soft'), T.literal('hard')))
	}),
	unlockResult: T.struct({
		type: T.literal('unlockResult'),
		id: T.number
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
	aggregate?: AggregateOptions
}

export interface GetMessage extends ClientMessage {
	type: 'get'
	path: string
}

export interface SubscribeMessage extends ClientMessage {
	type: 'subscribe'
	path: string
	filter?: QueryFilter
	aggregate?: AggregateOptions
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

export interface LockMessage extends ClientMessage {
	type: 'lock'
	path: string
	mode: 'soft' | 'hard'
}

export interface UnlockMessage extends ClientMessage {
	type: 'unlock'
	path: string
}

export interface PingMessage extends ClientMessage {
	type: 'ping'
}

// vim: ts=4
