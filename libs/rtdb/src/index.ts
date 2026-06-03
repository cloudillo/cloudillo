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
