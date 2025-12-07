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

import { describe, it, expect, beforeEach } from '@jest/globals'
import {
	DocumentSnapshotImpl,
	QuerySnapshotImpl,
	normalizePath,
	getIdFromPath,
	getCollectionFromPath,
	createDocumentFromEvent,
	delay
} from '../utils'

describe('DocumentSnapshotImpl', () => {
	it('should create existing document snapshot', () => {
		const data = { title: 'Test', author: 'alice' }
		const snapshot = new DocumentSnapshotImpl('doc1', true, data)

		expect(snapshot.id).toBe('doc1')
		expect(snapshot.exists).toBe(true)
		expect(snapshot.data()).toEqual(data)
	})

	it('should create non-existing document snapshot', () => {
		const snapshot = new DocumentSnapshotImpl('doc1', false)

		expect(snapshot.id).toBe('doc1')
		expect(snapshot.exists).toBe(false)
		expect(snapshot.data()).toBeUndefined()
	})

	it('should get field from document', () => {
		const data = { title: 'Test', author: 'alice', views: 100 }
		const snapshot = new DocumentSnapshotImpl('doc1', true, data)

		expect(snapshot.get('title')).toBe('Test')
		expect(snapshot.get('author')).toBe('alice')
		expect(snapshot.get('views')).toBe(100)
	})

	it('should return undefined for non-existent field', () => {
		const snapshot = new DocumentSnapshotImpl('doc1', true, { title: 'Test' })

		expect(snapshot.get('nonexistent')).toBeUndefined()
	})

	it('should return undefined for non-existent field on missing data', () => {
		const snapshot = new DocumentSnapshotImpl('doc1', false)

		expect(snapshot.get('any')).toBeUndefined()
	})
})

describe('QuerySnapshotImpl', () => {
	it('should create query snapshot with documents', () => {
		const docs = [
			{ id: 'doc1', data: { title: 'Post 1' } },
			{ id: 'doc2', data: { title: 'Post 2' } }
		]
		const snapshot = new QuerySnapshotImpl(docs)

		expect(snapshot.size).toBe(2)
		expect(snapshot.empty).toBe(false)
		expect(snapshot.docs.length).toBe(2)
	})

	it('should create empty query snapshot', () => {
		const snapshot = new QuerySnapshotImpl([])

		expect(snapshot.size).toBe(0)
		expect(snapshot.empty).toBe(true)
		expect(snapshot.docs.length).toBe(0)
	})

	it('should iterate documents with forEach', () => {
		const docs = [
			{ id: 'doc1', data: { title: 'Post 1' } },
			{ id: 'doc2', data: { title: 'Post 2' } }
		]
		const snapshot = new QuerySnapshotImpl(docs)

		const ids: string[] = []
		snapshot.forEach((doc) => {
			ids.push(doc.id)
		})

		expect(ids).toEqual(['doc1', 'doc2'])
	})

	it('should track document changes', () => {
		const docs = [{ id: 'doc1', data: { title: 'Post 1' } }]
		const snapshot = new QuerySnapshotImpl(docs)

		const changes = [
			{
				type: 'added' as const,
				doc: new DocumentSnapshotImpl('doc1', true, { title: 'Post 1' }),
				oldIndex: -1,
				newIndex: 0
			}
		]

		snapshot.setChanges(changes)
		expect(snapshot.docChanges()).toEqual(changes)
	})
})

describe('normalizePath', () => {
	it('should remove leading slashes', () => {
		expect(normalizePath('/posts')).toBe('posts')
		expect(normalizePath('//posts')).toBe('posts')
	})

	it('should remove trailing slashes', () => {
		expect(normalizePath('posts/')).toBe('posts')
		expect(normalizePath('posts//')).toBe('posts')
	})

	it('should remove both leading and trailing slashes', () => {
		expect(normalizePath('/posts/')).toBe('posts')
		expect(normalizePath('//posts//')).toBe('posts')
	})

	it('should preserve internal structure', () => {
		expect(normalizePath('/posts/123/comments/')).toBe('posts/123/comments')
		expect(normalizePath('posts/123/comments')).toBe('posts/123/comments')
	})

	it('should handle paths without slashes', () => {
		expect(normalizePath('posts')).toBe('posts')
	})
})

describe('getIdFromPath', () => {
	it('should extract ID from simple path', () => {
		expect(getIdFromPath('posts/123')).toBe('123')
	})

	it('should extract ID from nested path', () => {
		expect(getIdFromPath('posts/abc/comments/xyz')).toBe('xyz')
	})

	it('should handle leading/trailing slashes', () => {
		expect(getIdFromPath('/posts/123/')).toBe('123')
	})

	it('should handle single path segment', () => {
		expect(getIdFromPath('posts')).toBe('posts')
	})
})

describe('getCollectionFromPath', () => {
	it('should extract collection from simple path', () => {
		expect(getCollectionFromPath('posts/123')).toBe('posts')
	})

	it('should extract collection from nested path', () => {
		expect(getCollectionFromPath('posts/123/comments')).toBe('comments')
	})

	it('should handle leading/trailing slashes', () => {
		expect(getCollectionFromPath('/posts/123/comments/')).toBe('comments')
	})

	it('should handle single segment', () => {
		expect(getCollectionFromPath('posts')).toBe('posts')
	})
})

describe('createDocumentFromEvent', () => {
	it('should create snapshot from create event', () => {
		const event = {
			action: 'create' as const,
			path: 'posts/123',
			data: { title: 'Test' }
		}

		const snapshot = createDocumentFromEvent(event)

		expect(snapshot.exists).toBe(true)
		expect(snapshot.data()).toEqual({ title: 'Test' })
	})

	it('should create snapshot from update event', () => {
		const event = {
			action: 'update' as const,
			path: 'posts/123',
			data: { title: 'Updated' }
		}

		const snapshot = createDocumentFromEvent(event)

		expect(snapshot.exists).toBe(true)
		expect(snapshot.data()).toEqual({ title: 'Updated' })
	})

	it('should create snapshot from delete event', () => {
		const event = {
			action: 'delete' as const,
			path: 'posts/123'
		}

		const snapshot = createDocumentFromEvent(event)

		expect(snapshot.exists).toBe(false)
		expect(snapshot.data()).toBeUndefined()
	})

	it('should extract ID from path', () => {
		const event = {
			action: 'create' as const,
			path: 'posts/my-doc-id',
			data: { title: 'Test' }
		}

		const snapshot = createDocumentFromEvent(event)

		expect(snapshot.id).toBe('my-doc-id')
	})
})

describe('delay', () => {
	it('should resolve after specified milliseconds', async () => {
		const start = Date.now()
		await delay(50)
		const elapsed = Date.now() - start

		expect(elapsed).toBeGreaterThanOrEqual(50)
		expect(elapsed).toBeLessThan(150) // Allow some margin
	})

	it('should resolve immediately with 0ms', async () => {
		const promise = delay(0)

		expect(promise).toBeInstanceOf(Promise)
		await promise // Should not hang
	})
})

// vim: ts=4
