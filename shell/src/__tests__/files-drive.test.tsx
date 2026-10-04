// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import type { TFunction } from 'i18next'

import { navSearch } from '../apps/files/atoms.js'
import {
	audienceText,
	findRoom,
	leavesRoom,
	reparentPatch,
	widensAudience
} from '../apps/files/audience.js'
import { locationText } from '../apps/files/components/LocationChip.js'
import { buildFileFilterParams } from '../apps/files/hooks/useFileList.js'

// Interpolates like i18next with the key as the English string
const t = ((key: string, opts?: Record<string, unknown>) =>
	key.replace(/{{(\w+)}}/g, (_, k) => String(opts?.[k]))) as unknown as TFunction
const room = (r: Partial<PorchEntry>): PorchEntry => ({ name: 'board', status: 'in', ...r })

describe('navSearch (?drive= round-trip)', () => {
	it('keeps the drive alongside parentId and view', () => {
		const search = navSearch({ drive: 'board', parentId: 'f1', view: 'browse' })
		expect(search).toBe('drive=board&parentId=f1')
		const params = new URLSearchParams(search)
		expect(navSearch({ drive: params.get('drive'), parentId: params.get('parentId') })).toBe(
			search
		)
		expect(navSearch({ drive: 'board', view: 'trash' })).toBe('drive=board&view=trash')
	})

	it('omits the drive for the main drive', () => {
		expect(navSearch({ drive: null })).toBe('')
		expect(navSearch({ drive: null, parentId: 'f1' })).toBe('parentId=f1')
	})

	it('carries remoteOwner/shareRoot only inside a folder', () => {
		expect(navSearch({ parentId: 'f1', remoteOwner: 'bob.org', shareRoot: 's1' })).toBe(
			'parentId=f1&remoteOwner=bob.org&shareRoot=s1'
		)
		expect(navSearch({ parentId: null, remoteOwner: 'bob.org', shareRoot: 's1' })).toBe('')
	})
})

describe('locationText', () => {
	it('names the room and folder', () => {
		expect(locationText('Acme', '@acme.org~board', 'Minutes', false)).toBe('~board › Minutes')
	})

	it('names the context for the main drive', () => {
		expect(locationText('Acme', undefined, 'Events', false)).toBe('Acme › Events')
	})

	it('shows the drive only when driveOnly or no folder', () => {
		expect(locationText('Acme', '@acme.org~board', 'Minutes', true)).toBe('~board')
		expect(locationText('Acme', undefined, undefined, false)).toBe('Acme')
	})
})

describe('audienceText', () => {
	it('names every branch', () => {
		expect(audienceText(t, 'Acme', null)).toBe('All Acme members')
		expect(audienceText(t, 'Me', null, true)).toBe('Only you')
		expect(audienceText(t, 'Acme', undefined)).toBeUndefined()
		expect(audienceText(t, 'Acme', room({ closed: true, memberCount: 3 }))).toBe(
			'Invited members · 3 people'
		)
		expect(audienceText(t, 'Acme', room({ closed: true }))).toBe('Invited members')
		expect(audienceText(t, 'Acme', room({ minRole: null }))).toBe('Everyone who can see Acme')
		expect(audienceText(t, 'Acme', room({ minRole: 'moderator' }))).toBe('Moderators and above')
		expect(audienceText(t, 'Acme', room({}))).toBeUndefined()
	})
})

describe('leavesRoom', () => {
	it('is true only when an item leaves its room', () => {
		expect(leavesRoom(undefined, '@a~x')).toBe(false)
		expect(leavesRoom('@a~x', '@a~x')).toBe(false)
		expect(leavesRoom('@a~x', '@a~y')).toBe(true)
		expect(leavesRoom('@a~x', null)).toBe(true)
	})
})

describe('buildFileFilterParams channel', () => {
	it('applies the drive at the root only', () => {
		expect(buildFileFilterParams({ channel: '@a~x', parentId: null })).toEqual({
			channel: '@a~x'
		})
		expect(buildFileFilterParams({ channel: '', parentId: null })).toEqual({ channel: '' })
		expect(buildFileFilterParams({ channel: '@a~x', parentId: 'f1' })).toEqual({})
		expect(buildFileFilterParams({ channel: '@a~x' })).toEqual({})
		expect(buildFileFilterParams({ parentId: null })).toEqual({})
	})
})

describe('findRoom', () => {
	const porch = [room({ name: 'board' }), room({ name: 'ops' })]

	it("is 'unknown' until the porch loads", () => {
		expect(findRoom(undefined, 'acme.org', 'board')).toBe('unknown')
	})

	it('matches bare and tenant-qualified channels on the same tenant', () => {
		expect(findRoom(porch, 'acme.org', 'board')).toBe(porch[0])
		expect(findRoom(porch, 'acme.org', '@acme.org~ops')).toBe(porch[1])
	})

	it("does not match another tenant's room of the same name", () => {
		expect(findRoom(porch, 'acme.org', '@other.org~board')).toBeUndefined()
		expect(findRoom(porch, 'acme.org', 'gone')).toBeUndefined()
	})
})

describe('widensAudience', () => {
	const porch = [room({ name: 'board' })]

	it('in-place restore widens only when the room is gone or not yet known', () => {
		expect(widensAudience(porch, 'acme.org', 'board', 'board')).toBe(false)
		expect(widensAudience([], 'acme.org', 'board', 'board')).toBe(true)
		expect(widensAudience(undefined, 'acme.org', 'board', 'board')).toBe(true)
	})

	it('leaving a room widens', () => {
		expect(widensAudience(porch, 'acme.org', 'board', null)).toBe(true)
		expect(widensAudience(porch, 'acme.org', 'board', '@acme.org~ops')).toBe(true)
	})

	it('main-drive items never widen', () => {
		expect(widensAudience(porch, 'acme.org', null, '@acme.org~board')).toBe(false)
		expect(widensAudience(undefined, 'acme.org', undefined, null)).toBe(false)
	})

	it('bare and tenant-qualified forms compare equal', () => {
		expect(widensAudience(porch, 'acme.org', 'board', '@acme.org~board')).toBe(false)
		expect(widensAudience(porch, 'acme.org', '@acme.org~board', 'board')).toBe(false)
	})
})

describe('reparentPatch', () => {
	it('names the drive at the root and inherits it in a folder', () => {
		expect(reparentPatch(true, 'f1', '@a~x')).toEqual({ parentId: null, channel: '@a~x' })
		expect(reparentPatch(true, null, null)).toEqual({ parentId: null, channel: null })
		expect(reparentPatch(false, 'f1', '@a~x')).toEqual({ parentId: 'f1' })
	})
})

// vim: ts=4
