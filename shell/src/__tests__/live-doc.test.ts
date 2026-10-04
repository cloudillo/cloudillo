// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileView } from '@cloudillo/core'

import {
	buildLiveDocContent,
	isPostableHandDoc,
	isSameDoc,
	type LiveDocRef,
	parseLiveDocContent
} from '../apps/feed/live-doc.js'
import type { FileHandItem } from '../state/hand.js'

describe('parseLiveDocContent', () => {
	it('reads a valid live-document reference', () => {
		expect(
			parseLiveDocContent({
				doc: 'alice.org:abc123',
				contentType: 'cloudillo/quillo',
				title: 'Notes',
				text: 'have a look'
			})
		).toEqual({
			doc: 'alice.org:abc123',
			srcIdTag: 'alice.org',
			fileId: 'abc123',
			contentType: 'cloudillo/quillo',
			title: 'Notes',
			text: 'have a look'
		})
	})

	it('keeps colons in the fileId — only the first one splits', () => {
		expect(
			parseLiveDocContent({ doc: 'alice.org:abc:123', contentType: 'cloudillo/quillo' })
		).toMatchObject({ srcIdTag: 'alice.org', fileId: 'abc:123' })
	})

	it('keeps a real fileId shape intact — the guard rejects paths, not punctuation', () => {
		expect(
			parseLiveDocContent({ doc: 'bob.org:f1~a:b', contentType: 'cloudillo/quillo' })
		).toMatchObject({ srcIdTag: 'bob.org', fileId: 'f1~a:b' })
	})

	it('keeps dots inside a fileId — only a leading one is a path', () => {
		expect(
			parseLiveDocContent({ doc: 'bob.org:f1.v2', contentType: 'cloudillo/quillo' })
		).toMatchObject({ srcIdTag: 'bob.org', fileId: 'f1.v2' })
	})

	it('drops non-string title and text rather than failing', () => {
		expect(
			parseLiveDocContent({
				doc: 'alice.org:abc123',
				contentType: 'cloudillo/quillo',
				title: 42,
				text: { nope: true }
			})
		).toMatchObject({ title: undefined, text: undefined })
	})

	it.each([
		['a plain string (an ordinary TEXT post)', 'Just a post'],
		['null', null],
		['undefined', undefined],
		['a doc with no colon', { doc: 'nocolon', contentType: 'cloudillo/quillo' }],
		['a doc with an empty idTag', { doc: ':abc', contentType: 'cloudillo/quillo' }],
		['a doc with an empty fileId', { doc: 'a.org:', contentType: 'cloudillo/quillo' }],
		['a missing contentType', { doc: 'a.org:abc' }],
		['a non-string contentType', { doc: 'a.org:abc', contentType: 7 }],
		['a non-string doc', { doc: 7, contentType: 'cloudillo/quillo' }],
		// A federated `doc` is remote-peer input and reaches `appPath` and a token mint.
		[
			'path syntax in the idTag half',
			{ doc: 'x/../../@evil.tld/settings:1', contentType: 'cloudillo/quillo' }
		],
		[
			'an idTag that is not idTag-shaped',
			{ doc: 'evil tld:abc', contentType: 'cloudillo/quillo' }
		],
		[
			'path syntax in the fileId half',
			{ doc: 'good.tld:a/b', contentType: 'cloudillo/quillo' }
		],
		['a bare dot-dot idTag', { doc: '..:abc', contentType: 'cloudillo/quillo' }],
		// `..` is one path segment, so a "no slashes" test alone lets it through.
		['a dot-dot fileId', { doc: 'peer.tld:..', contentType: 'cloudillo/quillo' }],
		['a bare dot fileId', { doc: 'peer.tld:.', contentType: 'cloudillo/quillo' }],
		['a dot-prefixed fileId', { doc: 'peer.tld:.hidden', contentType: 'cloudillo/quillo' }],
		['a slash in the fileId', { doc: 'peer.tld:a/b', contentType: 'cloudillo/quillo' }],
		['an empty fileId half', { doc: 'peer.tld:', contentType: 'cloudillo/quillo' }],
		['a leading hyphen in the idTag', { doc: '-a.tld:abc', contentType: 'cloudillo/quillo' }],
		['an empty label in the idTag', { doc: 'a..tld:abc', contentType: 'cloudillo/quillo' }]
	])('returns undefined for %s', (_name, content) => {
		expect(parseLiveDocContent(content)).toBeUndefined()
	})
})

/*
 * fileIds are node-local, so a bare id match proves nothing: a federated document's id can collide
 * with an unrelated local row, whose name would then be rendered over the title that travelled
 * with the post — and, in the composer, whose visibility would drive the "narrower than the post"
 * notice and the widen write.
 */
describe('isSameDoc', () => {
	const OWNER = 'alice.org'
	const US = 'bob.org'
	const ref: LiveDocRef = {
		doc: `${OWNER}:f1`,
		srcIdTag: OWNER,
		fileId: 'f1',
		contentType: 'cloudillo/quillo'
	}
	const row = (over: Partial<FileView> = {}) => over as FileView

	it('accepts a row that originates on the owner’s own node', () => {
		expect(isSameDoc(row(), ref, OWNER)).toBe(true)
	})

	it('accepts our mirror of the owner’s copy', () => {
		expect(isSameDoc(row({ upstream: { idTag: OWNER } }), ref, US)).toBe(true)
	})

	it('rejects a local row that merely shares the id', () => {
		expect(isSameDoc(row(), ref, US)).toBe(false)
	})

	it('rejects a mirror of some third node', () => {
		expect(isSameDoc(row({ upstream: { idTag: 'carol.org' } }), ref, US)).toBe(false)
	})

	it('rejects a missing row', () => {
		expect(isSameDoc(undefined, ref, OWNER)).toBe(false)
	})
})

describe('buildLiveDocContent', () => {
	it('round-trips through parseLiveDocContent', () => {
		const content = buildLiveDocContent({
			srcIdTag: 'bob.org',
			fileId: 'f1',
			contentType: 'cloudillo/ideallo',
			title: 'Board',
			text: 'draft'
		})
		expect(content).toEqual({
			doc: 'bob.org:f1',
			contentType: 'cloudillo/ideallo',
			title: 'Board',
			text: 'draft'
		})
		expect(parseLiveDocContent(content)).toEqual({
			doc: 'bob.org:f1',
			srcIdTag: 'bob.org',
			fileId: 'f1',
			contentType: 'cloudillo/ideallo',
			title: 'Board',
			text: 'draft'
		})
	})
})

describe('isPostableHandDoc', () => {
	const item = (over: Partial<FileHandItem> = {}): FileHandItem => ({
		type: 'file',
		id: 'e1',
		fileId: 'f1',
		idTag: 'alice.org',
		sourceContext: 'alice.org',
		label: 'Notes',
		fileTp: 'CRDT',
		contentType: 'cloudillo/quillo',
		writable: true,
		...over
	})

	it('accepts a local writable live document', () => {
		expect(isPostableHandDoc(item())).toBe(true)
		expect(isPostableHandDoc(item({ fileTp: 'RTDB' }))).toBe(true)
	})

	// `idTag` is the upstream node for a mirror. The author cannot widen a copy that
	// lives on somebody else's node, so the post would be a link their followers cannot open.
	it('refuses a mirrored row', () => {
		expect(isPostableHandDoc(item({ idTag: 'bob.org', sourceContext: 'alice.org' }))).toBe(
			false
		)
	})

	it('refuses a read-only row', () => {
		expect(isPostableHandDoc(item({ writable: false }))).toBe(false)
	})

	// `handAtom` is in-memory only and `doPickUp` stamps `writable` on every pick-up, so an
	// item with no writability is not an old hand — it is one we cannot vouch for.
	it('refuses a row whose writability was never captured', () => {
		expect(isPostableHandDoc(item({ writable: undefined }))).toBe(false)
	})

	it.each([
		['a plain file', { fileTp: 'BLOB' }],
		['a row with no contentType', { contentType: undefined }],
		['a tombstone', { brokenAt: '2026-01-01' }],
		['a trashed row', { inTrash: true }]
	])('refuses %s', (_name, over) => {
		expect(isPostableHandDoc(item(over as Partial<FileHandItem>))).toBe(false)
	})
})

// vim: ts=4
