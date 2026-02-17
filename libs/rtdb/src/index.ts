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

// Main client
export { createRtdbClient, RtdbClient, WriteBatch } from './client.js'

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
	AggregateSnapshot
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
