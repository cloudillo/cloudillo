// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	CANVAS_CLIPBOARD_PREFIX,
	clipboardFileIds,
	clipboardSource,
	decodeCanvasClipboard,
	hasValidFileRef,
	isBounds,
	MAX_CANVAS_CLIPBOARD_CHARS,
	resolveForeignPaste,
	withoutFileRefs
} from '../utils/clipboard.js'
import { isEditableTarget } from '../utils/editable-target.js'

const FID = 'b1~abcdefghijklmnop'

interface Item {
	o?: { fid?: unknown }
}
const fid = (i: Item) => i?.o?.fid

describe('hasValidFileRef', () => {
	it('accepts no ref, and id-shaped refs only', () => {
		expect(hasValidFileRef(undefined)).toBe(true)
		expect(hasValidFileRef(FID)).toBe(true)
		expect(hasValidFileRef('@12')).toBe(true)
		expect(hasValidFileRef(42)).toBe(false)
		expect(hasValidFileRef('../../etc/passwd')).toBe(false)
	})
})

describe('clipboardFileIds / withoutFileRefs', () => {
	const items: Item[] = [{ o: { fid: 'a' } }, { o: {} }, { o: { fid: 7 } }, { o: { fid: 'b' } }]

	it('collects string file ids only', () => {
		expect(clipboardFileIds(items, fid)).toEqual(['a', 'b'])
		expect(clipboardFileIds(null as unknown as Item[], fid)).toEqual([])
	})

	it('drops the items whose file failed and keeps the rest', () => {
		expect(withoutFileRefs(items, fid, new Set(['a']))).toEqual(items.slice(1))
		expect(withoutFileRefs(items, fid, new Set())).toEqual(items)
	})
})

describe('decodeCanvasClipboard', () => {
	it('rejects oversize text', () => {
		const text = `${CANVAS_CLIPBOARD_PREFIX}{"app":"x","pad":"${'a'.repeat(MAX_CANVAS_CLIPBOARD_CHARS)}"}`
		expect(decodeCanvasClipboard(text, 'x')).toBeNull()
		expect(decodeCanvasClipboard(`${CANVAS_CLIPBOARD_PREFIX}{"app":"x"}`, 'x')).toEqual({
			app: 'x'
		})
	})
})

describe('resolveForeignPaste', () => {
	const KNOWN = 'b1~knownknownknownk'
	it('links unknown files of a same-document payload, not known ones', async () => {
		const linked: string[] = []
		const link = async (ref: string) => {
			linked.push(ref)
			return true
		}
		const payload = {
			source: { fileId: 'doc', ownerTag: 'evil.tld' },
			objects: [{ o: { fid: FID } }, { o: { fid: KNOWN } }] as Item[]
		}
		const res = await resolveForeignPaste(payload, 'doc', fid, link, new Set([KNOWN]), 'me.tld')
		expect(linked).toEqual([`cl:file/me.tld:${FID}`])
		expect(res.failed).toBe(0)
	})
})

describe('isBounds / clipboardSource', () => {
	it('accept only well-formed values', () => {
		expect(isBounds({ x: 1, y: -2, width: 3, height: 0 })).toBe(true)
		expect(isBounds({ x: 1, y: 2, width: -3, height: 4 })).toBe(false)
		expect(isBounds({ x: '1', y: 2, width: 3, height: 4 })).toBe(false)
		expect(isBounds({ x: Number.NaN, y: 2, width: 3, height: 4 })).toBe(false)
		expect(isBounds(null)).toBe(false)
		expect(clipboardSource({ fileId: 'f', ownerTag: 'o', x: 1 })).toEqual({
			fileId: 'f',
			ownerTag: 'o'
		})
		expect(clipboardSource({ fileId: 1, ownerTag: 'o' })).toBeUndefined()
		expect(clipboardSource(['f', 'o'])).toBeUndefined()
	})
})

describe('isEditableTarget', () => {
	it('matches inputs, dialogs and the given popover selector', () => {
		document.body.innerHTML =
			'<input id="i"><div role="dialog"><span id="d"></span></div><div class="pop"><b id="p"></b></div><i id="x"></i>'
		const el = (id: string) => document.getElementById(id)
		expect(isEditableTarget(el('i'))).toBe(true)
		expect(isEditableTarget(el('d'))).toBe(true)
		expect(isEditableTarget(el('p'))).toBe(false)
		expect(isEditableTarget(el('p'), '.pop')).toBe(true)
		expect(isEditableTarget(el('x'), '.pop')).toBe(false)
		expect(isEditableTarget(null)).toBe(false)
	})
})

// vim: ts=4
