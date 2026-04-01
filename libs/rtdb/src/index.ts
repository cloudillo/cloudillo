// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Main client
export { createRtdbClient, RtdbClient, WriteBatch } from './client.js'

// Field operators
export { increment, appendValues } from './types.js'

// References
export { CollectionReference } from './collection.js'
export { DocumentReference } from './document.js'
export { Query } from './query.js'
export { AggregateQuery } from './aggregate-query.js'

// Types
export type {
	RtdbClientOptions,
	WhereFilterOp,
	QueryFilter,
	DocumentSnapshot,
	QuerySnapshot,
	DocumentChange,
	ChangeEvent,
	LockEventData,
	UnlockEventData,
	SnapshotOptions,
	LockResult,
	AggregateOp,
	AggregateOpDef,
	AggregateOptions,
	AggregateGroupEntry,
	AggregateSnapshot,
	FieldOp,
	IncrementOp,
	AppendOp,
	UpdateData
} from './types.js'

// Errors
export {
	RtdbError,
	ConnectionError,
	AuthError,
	PermissionError,
	NotFoundError,
	ValidationError,
	TimeoutError
} from './errors.js'

// vim: ts=4
