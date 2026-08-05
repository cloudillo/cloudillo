// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Access-conflict classification. What this decides is what the user is shown
 * when an app iframe 401/403s: a "file is broken" toast, a read-only prompt, or
 * nothing at all — so each branch is pinned individually.
 */

import { jest } from '@jest/globals'

import type { ApiClient, FileView } from '@cloudillo/core'

import { classifyOutcome, refreshFileDeduped, suffixToAccess } from '../apps/access-conflict.js'

function file(props: Partial<FileView> = {}): FileView {
	return { fileId: 'f1', ...props } as FileView
}

describe('suffixToAccess', () => {
	it('maps every wire suffix', () => {
		expect(suffixToAccess('R')).toBe('read')
		expect(suffixToAccess('C')).toBe('comment')
		expect(suffixToAccess('W')).toBe('write')
	})
})

describe('classifyOutcome', () => {
	it('reports a tombstoned file as broken regardless of accessLevel', () => {
		const f = file({ brokenAt: '2026-01-01T00:00:00Z', accessLevel: 'write' })
		expect(classifyOutcome(f, 'W')).toEqual({ kind: 'broken', file: f })
		expect(classifyOutcome(f, 'R')).toEqual({ kind: 'broken', file: f })
	})

	it('reports a lower granted level as a downgrade', () => {
		const f = file({ accessLevel: 'read' })
		expect(classifyOutcome(f, 'W')).toEqual({
			kind: 'downgraded',
			file: f,
			requested: 'write',
			granted: 'read'
		})
		expect(classifyOutcome(f, 'C')).toEqual({
			kind: 'downgraded',
			file: f,
			requested: 'comment',
			granted: 'read'
		})
		expect(classifyOutcome(file({ accessLevel: 'comment' }), 'W')).toMatchObject({
			kind: 'downgraded',
			requested: 'write',
			granted: 'comment'
		})
	})

	it('never downgrades a read request — nothing outranks read', () => {
		expect(classifyOutcome(file({ accessLevel: 'read' }), 'R')).toEqual({ kind: 'unchanged' })
		expect(classifyOutcome(file({ accessLevel: 'write' }), 'R')).toEqual({ kind: 'unchanged' })
		expect(classifyOutcome(file(), 'R')).toEqual({ kind: 'unchanged' })
	})

	it('collapses admin to write, so a write request is unchanged', () => {
		expect(classifyOutcome(file({ accessLevel: 'admin' }), 'W')).toEqual({ kind: 'unchanged' })
	})

	it('reads a missing or none accessLevel as a downgrade, not as broken', () => {
		// The backend's refresh sometimes omits accessLevel even when access
		// remains; the row would have been tombstoned if it were really gone.
		expect(classifyOutcome(file(), 'W')).toMatchObject({ kind: 'downgraded', granted: 'read' })
		expect(classifyOutcome(file({ accessLevel: 'none' }), 'W')).toMatchObject({
			kind: 'downgraded',
			granted: 'read'
		})
	})

	it('reports same-or-higher access as unchanged', () => {
		expect(classifyOutcome(file({ accessLevel: 'write' }), 'W')).toEqual({ kind: 'unchanged' })
		expect(classifyOutcome(file({ accessLevel: 'comment' }), 'C')).toEqual({
			kind: 'unchanged'
		})
		expect(classifyOutcome(file({ accessLevel: 'write' }), 'C')).toEqual({ kind: 'unchanged' })
	})
})

describe('refreshFileDeduped', () => {
	/** An ApiClient stub exposing only the one call this module makes. */
	function stubApi(refresh: (fileId: string) => Promise<FileView>) {
		const fn = jest.fn(refresh)
		return { api: { files: { refresh: fn } } as unknown as ApiClient, fn }
	}

	it('shares one in-flight refresh between concurrent callers', async () => {
		let release: (f: FileView) => void = () => {}
		const { api, fn } = stubApi(() => new Promise<FileView>((resolve) => (release = resolve)))

		const a = refreshFileDeduped(api, 'f1')
		const b = refreshFileDeduped(api, 'f1')
		expect(a).toBe(b)
		expect(fn).toHaveBeenCalledTimes(1)

		release(file())
		await a
	})

	it('keys the dedup by fileId', async () => {
		const { api, fn } = stubApi(async (fileId) => file({ fileId }))
		await Promise.all([refreshFileDeduped(api, 'f1'), refreshFileDeduped(api, 'f2')])
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it('clears the entry on success, so a later call refetches', async () => {
		const { api, fn } = stubApi(async () => file())
		await refreshFileDeduped(api, 'f1')
		await refreshFileDeduped(api, 'f1')
		expect(fn).toHaveBeenCalledTimes(2)
	})

	it('clears the entry on rejection too, so a failure is not cached', async () => {
		const { api, fn } = stubApi(async () => {
			throw new Error('boom')
		})
		await expect(refreshFileDeduped(api, 'f1')).rejects.toThrow('boom')
		await expect(refreshFileDeduped(api, 'f1')).rejects.toThrow('boom')
		expect(fn).toHaveBeenCalledTimes(2)
	})
})

// vim: ts=4
