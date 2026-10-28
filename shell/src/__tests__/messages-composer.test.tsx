// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Composer helpers: drafts, `@` mentions, the attachment image/file rule, and the
 * pending-invites hook.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import type { ActionView, Profile } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import { act, renderHook } from '@testing-library/react'

import { mockCloudilloReact } from './helpers/mocks.js'

const ME = 'me.test'

type Handler = (m: { cmd: string; data: unknown }) => void
let wsHandler: Handler = () => {}
jest.unstable_mockModule('../ws-bus.js', () => ({
	useWsBus: (_opts: unknown, h: Handler) => {
		wsHandler = h
	}
}))
const listInvites = jest.fn<(q: unknown) => Promise<ActionView[]>>()
const api = { actions: { list: listInvites } }
await mockCloudilloReact({ useAuth: () => [{ idTag: ME }], useApi: () => ({ api }) })

const { DRAFT_PREFIX, clearDraft, loadDraft, saveDraft } = await import(
	'../apps/messages/composer/drafts.js'
)
const { mentionOptions, mentionQuery } = await import('../apps/messages/composer/MentionPicker.js')
const { MAX_IMAGE_ATTACHMENTS, attachmentRefusal } = await import(
	'../apps/messages/composer/useAttachments.js'
)
const { usePendingInvites } = await import('../apps/messages/hooks/usePendingInvites.js')

describe('drafts', () => {
	beforeEach(() => localStorage.clear())

	it('round-trips under DRAFT_PREFIX', () => {
		saveDraft('c1', 'hello')
		expect(localStorage.getItem(`${DRAFT_PREFIX}-.c1`)).toBe('hello')
		expect(loadDraft('c1')).toBe('hello')
		clearDraft('c1')
		expect(loadDraft('c1')).toBe('')
	})

	it('removes the key on blank text', () => {
		saveDraft('c1', 'hello')
		saveDraft('c1', '  ')
		expect(localStorage.getItem(`${DRAFT_PREFIX}-.c1`)).toBeNull()
	})
})

describe('mentions', () => {
	const members = [
		{ idTag: 'bob.test', name: 'Bob' },
		{ idTag: 'alice.test', name: 'Alice Bobson' },
		{ idTag: 'carol.test' }
	] as Profile[]

	it('mentionOptions filters by idTag prefix or name, @all first for moderators', () => {
		expect(mentionOptions(members, 'bob', false, 'All').map((o) => o.idTag)).toEqual([
			'bob.test',
			'alice.test'
		])
		expect(mentionOptions(members, '', true, 'All').map((o) => o.idTag)).toEqual([
			'all',
			'bob.test',
			'alice.test',
			'carol.test'
		])
		expect(mentionOptions(members, 'car', true, 'All')).toEqual([
			{ idTag: 'carol.test', name: 'carol.test', profile: members[2] }
		])
	})

	it('mentionQuery reads the @query before the caret', () => {
		const editor = document.createElement('div')
		editor.contentEditable = 'true'
		document.body.append(editor)
		const caretAt = (text: string, offset = text.length) => {
			editor.textContent = text
			const sel = window.getSelection()!
			sel.collapse(editor.firstChild, offset)
			return mentionQuery(editor)
		}
		expect(caretAt('hi @bo')).toBe('bo')
		expect(caretAt('hi @')).toBe('')
		expect(caretAt('mail bob@x')).toBeUndefined()
		expect(caretAt('@bob done')).toBeUndefined()
		expect(caretAt('@bob done', 4)).toBe('bob')
		editor.remove()
	})
})

describe('attachmentRefusal', () => {
	const t = ((s: string) => s) as unknown as TFunction
	const img = (n = 'a.png') => new File([''], n, { type: 'image/png' })
	const doc = (n = 'a.pdf') => new File([''], n, { type: 'application/pdf' })
	const image = { isImage: true }
	const file = { isImage: false }

	it('accepts images, or one file', () => {
		expect(attachmentRefusal([], [img(), img()], t)).toBeUndefined()
		expect(attachmentRefusal([image], [img()], t)).toBeUndefined()
		expect(attachmentRefusal([], [doc()], t)).toBeUndefined()
	})

	it('refuses mixing images and files', () => {
		expect(attachmentRefusal([], [img(), doc()], t)).toMatch(/same message/)
		expect(attachmentRefusal([image], [doc()], t)).toMatch(/same message/)
		expect(attachmentRefusal([file], [img()], t)).toMatch(/same message/)
	})

	it('refuses a second file', () => {
		expect(attachmentRefusal([file], [doc()], t)).toMatch(/one file/)
		expect(attachmentRefusal([], [doc(), doc('b.pdf')], t)).toMatch(/one file/)
	})

	it('refuses more than the image cap', () => {
		const current = Array.from({ length: MAX_IMAGE_ATTACHMENTS }, () => image)
		expect(attachmentRefusal(current, [img()], t)).toMatch(/At most/)
		expect(attachmentRefusal(current.slice(1), [img()], t)).toBeUndefined()
	})
})

describe('usePendingInvites', () => {
	const invt = (actionId: string, over: Partial<ActionView> = {}) =>
		({
			actionId,
			type: 'INVT',
			status: 'C',
			issuer: { idTag: 'owner.test' },
			audience: { idTag: ME },
			subject: 'a1~conv',
			createdAt: 1,
			...over
		}) as ActionView

	it('loads invites to me and adds live ones once', async () => {
		listInvites.mockResolvedValue([invt('i1')])
		const { result } = renderHook(() => usePendingInvites())
		await act(async () => {})
		expect(result.current.pendingInvites).toHaveLength(1)
		expect(listInvites).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'INVT', status: 'C', audience: ME })
		)

		act(() => wsHandler({ cmd: 'ACTION', data: invt('i2') }))
		act(() => wsHandler({ cmd: 'ACTION', data: invt('i2') }))
		// Not mine, not pending, a revocation: ignored
		act(() => wsHandler({ cmd: 'ACTION', data: invt('i3', { audience: { idTag: 'x' } }) }))
		act(() => wsHandler({ cmd: 'ACTION', data: invt('i4', { status: 'A' }) }))
		act(() => wsHandler({ cmd: 'ACTION', data: invt('i5', { subType: 'DEL' }) }))
		expect(result.current.pendingInvites?.map((i) => i.actionId)).toEqual(['i2', 'i1'])
	})

	it('flags a failed load', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {})
		listInvites.mockRejectedValue(new Error('boom'))
		const { result } = renderHook(() => usePendingInvites())
		await act(async () => {})
		expect(result.current.error).toBe(true)
		expect(result.current.pendingInvites).toEqual([])
	})
})

// vim: ts=4
