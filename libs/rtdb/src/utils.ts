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

import {
	DocumentSnapshot,
	QuerySnapshot,
	DocumentChange,
	ChangeEvent
} from './types.js'

export class DocumentSnapshotImpl<T = any> implements DocumentSnapshot<T> {
	constructor(
		readonly id: string,
		readonly exists: boolean,
		private _data?: T
	) {}

	data(): T | undefined {
		return this._data
	}

	get(field: string): any {
		if (!this._data || typeof this._data !== 'object') {
			return undefined
		}

		return (this._data as any)[field]
	}
}

export class QuerySnapshotImpl<T = any> implements QuerySnapshot<T> {
	readonly docs: DocumentSnapshot<T>[]
	private _changes: DocumentChange<T>[] = []

	constructor(documents: Array<{ id: string; data: any }>) {
		this.docs = documents.map(
			(doc) => new DocumentSnapshotImpl<T>(doc.id, true, doc.data)
		)
	}

	get size(): number {
		return this.docs.length
	}

	get empty(): boolean {
		return this.docs.length === 0
	}

	forEach(callback: (doc: DocumentSnapshot<T>) => void): void {
		this.docs.forEach(callback)
	}

	docChanges(): DocumentChange<T>[] {
		return this._changes
	}

	setChanges(changes: DocumentChange<T>[]): void {
		this._changes = changes
	}
}

export function normalizePath(path: string): string {
	// Remove leading/trailing slashes
	return path.replace(/^\/+|\/+$/g, '')
}

export function getIdFromPath(path: string): string {
	const parts = normalizePath(path).split('/')
	return parts[parts.length - 1]
}

export function getCollectionFromPath(path: string): string {
	const parts = normalizePath(path).split('/')
	// For paths like "posts", return "posts"
	// For paths like "posts/123", return "posts" (doc is parent)
	// For paths like "posts/123/comments", return "comments" (doc is parent)
	// Pattern: return the last segment that's a collection (odd position from end)
	if (parts.length === 1) {
		return parts[0]
	}
	// For paths with multiple segments, the collection is at an even distance from the end
	// e.g., "posts/123" -> parts = ["posts", "123"] (length 2) -> return parts[0]
	// e.g., "posts/123/comments" -> parts = ["posts", "123", "comments"] (length 3) -> return parts[2]
	return parts.length % 2 === 0 ? parts[parts.length - 2] : parts[parts.length - 1]
}

export function createDocumentFromEvent(event: ChangeEvent): DocumentSnapshot {
	const id = getIdFromPath(event.path)

	if (event.action === 'delete') {
		return new DocumentSnapshotImpl(id, false)
	}

	return new DocumentSnapshotImpl(id, true, event.data)
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// vim: ts=4
