// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	buildFileFilterParams,
	countActiveFilters,
	type FilesFilters,
	type FilesQueryContext,
	legacyViewSearch,
	parseFilesFilters,
	resolveScope
} from '../apps/files/hooks/useFilesFilters.js'

const DAY = 86400
const NOW = 1_700_006_400 // a UTC midnight

const parse = (search: string) => parseFilesFilters(new URLSearchParams(search))
const browse = (ctx: Partial<FilesQueryContext> = {}): FilesQueryContext => ({
	viewMode: 'browse',
	parentId: null,
	channel: '',
	now: NOW,
	...ctx
})
const build = (search: string, ctx?: Partial<FilesQueryContext>) =>
	buildFileFilterParams(parse(search), browse(ctx))

describe('parseFilesFilters', () => {
	it('parses every param', () => {
		expect(
			parse(
				'scope=all&q=x&starred=1&recent=1&tags=a,b&type=doc&access=people,link&owner=me&modified=7d&perm=edit'
			)
		).toEqual<FilesFilters>({
			scope: 'all',
			q: 'x',
			starred: true,
			recent: true,
			tags: ['a', 'b'],
			type: 'doc',
			access: ['people', 'link'],
			owner: 'me',
			modified: '7d',
			perm: 'edit'
		})
	})

	it('drops invalid enum values', () => {
		const f = parse('scope=room&type=video&access=people,bogus&owner=you&modified=1d&perm=x')
		expect(f.scope).toBeUndefined()
		expect(f.type).toBeUndefined()
		expect(f.access).toEqual(['people'])
		expect(f.owner).toBeUndefined()
		expect(f.modified).toBeUndefined()
		expect(f.perm).toBeUndefined()
		expect(parse('starred=true').starred).toBe(false)
	})
})

describe('resolveScope', () => {
	it('lets an explicit scope win', () => {
		expect(resolveScope(parse('scope=folder&q=x'))).toBe('folder')
		expect(resolveScope(parse('scope=all'))).toBe('all')
	})

	it('derives drive while a finder is active, else folder', () => {
		expect(resolveScope(parse('q=x'))).toBe('drive')
		expect(resolveScope(parse('starred=1'))).toBe('drive')
		expect(resolveScope(parse('recent=1'))).toBe('drive')
		expect(resolveScope(parse('tags=a'))).toBe('drive')
		expect(resolveScope(parse('q=%20'))).toBe('folder')
		expect(resolveScope(parse('type=doc&owner=me'))).toBe('folder')
	})
})

describe('countActiveFilters', () => {
	it('counts each param once and ignores scope', () => {
		expect(countActiveFilters(parse(''))).toBe(0)
		expect(countActiveFilters(parse('scope=all'))).toBe(0)
		expect(countActiveFilters(parse('tags=a,b,c&access=people,link'))).toBe(2)
		expect(
			countActiveFilters(
				parse(
					'q=x&starred=1&recent=1&tags=a&type=doc&access=link&owner=me&modified=7d&perm=read'
				)
			)
		).toBe(9)
	})
})

describe('legacyViewSearch', () => {
	it('maps view=starred|recent to the finder', () => {
		expect(legacyViewSearch(new URLSearchParams('drive=board&view=starred'))).toBe(
			'drive=board&starred=1'
		)
		expect(legacyViewSearch(new URLSearchParams('view=recent'))).toBe('recent=1')
	})

	it('leaves other views alone', () => {
		expect(legacyViewSearch(new URLSearchParams('view=trash'))).toBeNull()
		expect(legacyViewSearch(new URLSearchParams('parentId=f1'))).toBeNull()
	})
})

describe('buildFileFilterParams', () => {
	it('folder scope: the current folder, the drive channel at the root only', () => {
		expect(build('', { channel: '@a~x' })).toEqual({ parentId: '__root__', channel: '@a~x' })
		expect(build('', { channel: '@a~x', parentId: 'f1' })).toEqual({ parentId: 'f1' })
		expect(build('', { channel: undefined })).toEqual({ parentId: '__root__' })
	})

	it('drive scope: the whole drive, recursive', () => {
		expect(build('q=x', { channel: '@a~x', parentId: 'f1' })).toEqual({
			parentId: '__root__',
			channel: '@a~x',
			recursive: true,
			withParent: true,
			fileName: 'x'
		})
	})

	it('drive scope while remote: the share root subtree', () => {
		expect(build('scope=drive', { channel: undefined, shareRoot: 's1' })).toEqual({
			parentId: 's1',
			recursive: true,
			withParent: true
		})
	})

	it('all scope: recursive with no parent or channel', () => {
		expect(build('scope=all', { channel: '@a~x', parentId: 'f1' })).toEqual({
			recursive: true,
			withParent: true
		})
	})

	it('trash and managed map only q', () => {
		expect(build('q=x&starred=1&type=doc', { viewMode: 'trash' })).toEqual({
			parentId: '__trash__',
			withParent: true,
			fileName: 'x'
		})
		expect(build('starred=1', { viewMode: 'managed' })).toEqual({
			parentId: '__managed__',
			withParent: true
		})
	})

	it('type keeps subfolders in folder scope only', () => {
		expect(build('type=doc').fileTp).toBe('CRDT,RTDB,FLDR')
		expect(build('type=file').fileTp).toBe('BLOB,FLDR')
		expect(build('type=folder').fileTp).toBe('FLDR')
		expect(build('type=doc&scope=drive').fileTp).toBe('CRDT,RTDB')
	})

	it('image filters by content type, not fileTp', () => {
		const params = build('type=image')
		expect(params.contentType).toBe('image/*')
		expect(params.fileTp).toBeUndefined()
	})

	it('recent sets openedSince and the recent sort', () => {
		expect(build('recent=1')).toMatchObject({
			openedSince: NOW - 30 * DAY,
			sort: 'recent',
			sortDir: 'desc'
		})
	})

	it('modified, starred, tags and access', () => {
		expect(build('modified=7d&starred=1&tags=a,b&access=link')).toMatchObject({
			modifiedAfter: NOW - 7 * DAY,
			starred: true,
			tags: ['a', 'b'],
			access: ['link']
		})
	})

	it('owner me/others compares against ownerIdTag', () => {
		expect(build('owner=me', { ownerIdTag: 'me.org' }).ownerIdTag).toBe('me.org')
		expect(build('owner=others', { ownerIdTag: 'me.org' }).notOwnerIdTag).toBe('me.org')
		const noOwner = build('owner=me')
		expect(noOwner.ownerIdTag).toBeUndefined()
		expect(noOwner.notOwnerIdTag).toBeUndefined()
	})

	it('perm is never sent to the server', () => {
		expect(build('perm=edit')).toEqual({ parentId: '__root__', channel: '' })
	})
})

// vim: ts=4
