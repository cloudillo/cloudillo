// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ActionView } from '@cloudillo/types'

import { msgNotifyKey } from '../notifications/useActionNotifications.js'

const msg = (notify?: string, over: Partial<ActionView> = {}) =>
	({ type: 'MSG', issuer: { idTag: 'bob' }, notify, ...over }) as ActionView & {
		notify?: string
	}

describe('msgNotifyKey', () => {
	it('stays silent when the backend gate suppressed it', () => {
		expect(msgNotifyKey(msg('none'), undefined, 'bob', 'me')).toBeUndefined()
		expect(msgNotifyKey(msg('none'), undefined, undefined, 'me')).toBeUndefined()
	})

	it('stays silent for the open conversation', () => {
		expect(msgNotifyKey(msg('mention'), 'bob', 'bob', 'me')).toBeUndefined()
		expect(msgNotifyKey(msg(), 'bob', 'bob', 'me')).toBeUndefined()
	})

	it('maps the stamp to a key', () => {
		expect(msgNotifyKey(msg('mention'), 'alice', 'bob', 'me')).toBe('mention')
		expect(msgNotifyKey(msg('message'), undefined, 'bob', 'me')).toBe('message')
	})

	it('defaults to message without a stamp', () => {
		expect(msgNotifyKey(msg(), undefined, 'bob', 'me')).toBe('message')
		expect(msgNotifyKey(msg(), undefined, undefined, 'me')).toBe('message')
		expect(msgNotifyKey(msg(), undefined, 'bob', undefined)).toBe('message')
	})

	it('stays silent for an own echo', () => {
		const own = msg(undefined, { issuer: { idTag: 'me' } as ActionView['issuer'] })
		expect(msgNotifyKey(own, undefined, 'bob', 'me')).toBeUndefined()
	})

	it('stays silent for edits and deletes', () => {
		expect(
			msgNotifyKey(msg(undefined, { subType: 'UPD' }), undefined, 'bob', 'me')
		).toBeUndefined()
		expect(
			msgNotifyKey(msg(undefined, { subType: 'DEL' }), undefined, 'bob', 'me')
		).toBeUndefined()
	})
})

// vim: ts=4
