// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export { AggregateQuery } from './aggregate-query.js'
// Main client
export { createRtdbClient, RtdbClient, WriteBatch } from './client.js'
// References
export { CollectionReference } from './collection.js'
export { DocumentReference } from './document.js'
// Errors
export {
	AuthError,
	ConnectionError,
	NotFoundError,
	PermissionError,
	RtdbError,
	TimeoutError,
	ValidationError
} from './errors.js'
// Presence — the shared core surface is re-exported so a presence-using app has
// one import site, exactly as @cloudillo/crdt does for the awareness transport.
export { RtdbPresence, type RtdbPresenceOptions } from './presence.js'
export {
	PRESENCE_FIELD,
	PRESENCE_THROTTLE_MS,
	buildPresenceUser,
	type PresenceEntry,
	type PresenceFeed,
	type PresenceUser
} from '@cloudillo/core'
export { Query } from './query.js'
// Types
export type {
	AggregateGroupEntry,
	AggregateOp,
	AggregateOpDef,
	AggregateOptions,
	AggregateSnapshot,
	AppendOp,
	ChangeEvent,
	DocumentChange,
	DocumentSnapshot,
	FieldOp,
	IncrementOp,
	LockEventData,
	LockResult,
	PresenceEvent,
	PresenceMessage,
	PresenceWireEntry,
	QueryFilter,
	QuerySnapshot,
	RtdbClientOptions,
	SnapshotOptions,
	UnlockEventData,
	UpdateData,
	WhereFilterOp
} from './types.js'
// Field operators
export { appendValues, increment } from './types.js'

// vim: ts=4
