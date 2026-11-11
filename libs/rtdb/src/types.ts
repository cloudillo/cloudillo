// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as T from '@symbion/runtype'

// ============================================================================
// Field Operators (server-side atomic operations)
// ============================================================================

export interface IncrementOp {
	$op: 'increment'
	by: number
}

export interface AppendOp {
	$op: 'append'
	values: unknown[]
}

export type FieldOp = IncrementOp | AppendOp

/** Makes each field accept either its original type or a FieldOp */
export type UpdateData<T> = {
	[K in keyof T]?: T[K] | FieldOp
}

export function increment(by = 1): IncrementOp {
	return { $op: 'increment', by }
}

export function appendValues(values: unknown[]): AppendOp {
	return { $op: 'append', values }
}

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
	equals?: Record<string, unknown>
	notEquals?: Record<string, unknown>
	greaterThan?: Record<string, unknown>
	lessThan?: Record<string, unknown>
	inArray?: Record<string, unknown>
	notInArray?: Record<string, unknown>
	arrayContains?: Record<string, unknown>
	arrayContainsAny?: Record<string, unknown>
	arrayContainsAll?: Record<string, unknown>
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
	[key: string]: string | number | boolean
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
	/** Top-level fields to return. `id` always comes back regardless. */
	select?: string[]
}

export interface SubscriptionOptions {
	table: string
	filter?: QueryFilter
	select?: string[]
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
	action: 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'ready' | 'replace'
	path: string
	data?: unknown
}

/** How much of the path a subscription covers. See the server's `SubscriptionScope`. */
export type SubscriptionScope = 'document' | 'children' | 'subtree'

export interface SnapshotOptions {
	onError?: (error: Error) => void
	onLock?: (event: ChangeEvent) => void
	/** Which documents this subscription covers. `'children'` — the collection's own
	 *  documents — by default; `'subtree'` also delivers documents in sub-collections
	 *  beneath it, which is what every subscription did before this option existed. */
	scope?: Extract<SubscriptionScope, 'children' | 'subtree'>
}

export interface LockResult {
	locked: boolean
	holder?: string
	mode?: 'soft' | 'hard'
}

export interface DocumentSnapshot<T = unknown> {
	id: string
	exists: boolean
	data(): T | undefined
	get(field: string): unknown
}

export interface DocumentChange<T = unknown> {
	type: 'added' | 'modified' | 'removed'
	doc: DocumentSnapshot<T>
	oldIndex: number
	newIndex: number
}

export interface QuerySnapshot<T = unknown> {
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
		/**
		 * Obtain a *fresh* token after the server rejected the current one
		 * (close code 4401). Without it, an expired token is terminal: the
		 * socket closes and every subscription errors out for good.
		 *
		 * `getToken` alone is not enough — call sites typically hand over a
		 * thunk like `() => bus.accessToken`, which keeps returning the same
		 * stale value. This hook must actually renew (e.g. `bus.refreshToken()`).
		 */
		refreshToken?: () => Promise<string | undefined>
	}
	serverUrl: string
	options?: {
		enableCache?: boolean
		reconnect?: boolean
		reconnectDelay?: number
		maxReconnectDelay?: number
		debug?: boolean
		/**
		 * Opt into the presence channel (`?presence=true` on the socket URL).
		 *
		 * Connection-level and fixed for the socket's lifetime, so it must be set
		 * here rather than at `client.presence()` time. Without it the server
		 * answers every presence frame with a 400.
		 */
		presence?: boolean
		/** Queued writes older than this are rejected on flush instead of sent. Default 10 min. */
		maxQueuedWriteAgeMs?: number
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
	offset: T.optional(T.number),
	select: T.optional(T.array(T.string))
})

export const tChangeEvent = T.struct({
	action: T.union(
		T.literal('create'),
		T.literal('update'),
		T.literal('delete'),
		T.literal('lock'),
		T.literal('unlock'),
		T.literal('ready'),
		T.literal('replace')
	),
	path: T.string,
	data: T.optional(T.nullable(T.unknown))
})

/**
 * One roster member as the server writes it.
 *
 * `state` is whatever that peer published — free-form and unvalidated beyond the
 * `user.idTag` the server stamps. `@cloudillo/core`'s `readPresenceEntries` is
 * what reads it defensively.
 */
export const tPresenceWireEntry = T.struct({
	connId: T.string,
	state: T.optional(T.nullable(T.unknown))
})

/**
 * The four presence events, all idempotent by `connId`.
 *
 * `sync` replaces the whole roster and arrives once per connection, before any
 * other presence frame; its `connId` is this connection's own, which is how a
 * client recognises itself. `join`/`update` upsert, `leave` deletes. Events are
 * never echoed to their originator.
 */
export const tPresenceEvent = T.taggedUnion('action')({
	sync: T.struct({
		action: T.literal('sync'),
		connId: T.string,
		users: T.array(tPresenceWireEntry)
	}),
	join: T.struct({
		action: T.literal('join'),
		connId: T.string,
		state: T.optional(T.nullable(T.unknown))
	}),
	update: T.struct({
		action: T.literal('update'),
		connId: T.string,
		state: T.optional(T.nullable(T.unknown))
	}),
	leave: T.struct({
		action: T.literal('leave'),
		connId: T.string
	})
})

export type PresenceWireEntry = T.TypeOf<typeof tPresenceWireEntry>
export type PresenceEvent = T.TypeOf<typeof tPresenceEvent>

// Every server frame is `{id: string, type, data}`; responses echo the request id,
// pushes (`change`, `presenceChange`) carry a fresh random id.
const frame = <K extends string, D>(type: K, data: T.Type<D>) =>
	T.struct({ type: T.literal(type), id: T.string, data })
const tEmpty = T.struct({})

export const tServerMessage = T.taggedUnion('type')({
	queryResult: frame('queryResult', T.array(T.unknown)),
	getResult: frame('getResult', T.nullable(T.unknown)),
	subscribeResult: frame('subscribeResult', T.struct({ subscriptionId: T.string })),
	unsubscribeResult: frame('unsubscribeResult', tEmpty),
	createIndexResult: frame('createIndexResult', T.unknown),
	change: frame('change', T.struct({ subscriptionId: T.string, event: tChangeEvent })),
	transactionResult: frame(
		'transactionResult',
		T.struct({
			results: T.array(
				T.struct({
					ref: T.nullable(T.string),
					id: T.nullable(T.string)
				})
			)
		})
	),
	lockResult: frame(
		'lockResult',
		T.struct({
			locked: T.boolean,
			holder: T.optional(T.string),
			mode: T.optional(T.union(T.literal('soft'), T.literal('hard')))
		})
	),
	unlockResult: frame('unlockResult', tEmpty),
	/** Same object as the REST `error` body; `code` is an `E-…` registry code. */
	error: frame(
		'error',
		T.struct({
			code: T.string,
			message: T.string,
			details: T.optional(T.unknown)
		})
	),
	/** `throttled`: the state was neither stored nor broadcast — resend it. */
	presenceResult: frame('presenceResult', T.struct({ throttled: T.optional(T.boolean) })),
	// Declaring this member is what keeps presence working at all: `handleMessage`
	// logs and drops anything the union cannot decode.
	presenceChange: frame('presenceChange', T.struct({ event: tPresenceEvent })),
	pong: frame('pong', tEmpty)
})

export type ServerMessage = T.TypeOf<typeof tServerMessage>

/** A request as the client builds it; `send` moves every field but `type` into `data`. */
export interface ClientMessage {
	type: string
	[key: string]: unknown
}

/** A client frame on the wire. */
export interface WireFrame {
	id: string
	type: string
	data: Record<string, unknown>
}

export interface QueryMessage extends ClientMessage {
	type: 'query'
	path: string
	filter?: QueryFilter
	sort?: Array<{ field: string; ascending: boolean }>
	limit?: number
	offset?: number
	aggregate?: AggregateOptions
	select?: string[]
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
	select?: string[]
	scope?: SubscriptionScope
}

export interface UnsubscribeMessage extends ClientMessage {
	type: 'unsubscribe'
	subscriptionId: string
}

export interface TransactionOperation {
	type: 'create' | 'update' | 'replace' | 'delete'
	path: string
	data?: unknown
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

export interface PresenceMessage extends ClientMessage {
	type: 'presence'
	/** Absent or null clears this connection's roster entry (peers get `leave`). */
	state?: Record<string, unknown> | null
}

export interface PingMessage extends ClientMessage {
	type: 'ping'
}

// vim: ts=4
