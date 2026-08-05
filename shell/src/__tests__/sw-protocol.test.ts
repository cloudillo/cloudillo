// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The page <-> worker wire format. The worker acts on these messages with the
 * session token, the API key and the encryption key in reach, so "a malformed
 * message is rejected" is the property under test, not a formality.
 */

import { decodeSwInbound, decodeSwMessage, PROTOCOL_VERSION } from '../../shared/sw-protocol.js'

/** A well-formed page -> worker envelope with `fields` merged in. */
function msg(type: string, fields: Record<string, unknown> = {}) {
	return { cloudillo: true, v: PROTOCOL_VERSION, type, ...fields }
}

describe('decodeSwMessage', () => {
	it('accepts every page -> worker type with its payload', () => {
		expect(decodeSwMessage(msg('sw:token.set', { payload: { token: 'tok' } }))).toEqual(
			msg('sw:token.set', { payload: { token: 'tok' } })
		)
		expect(decodeSwMessage(msg('sw:token.clear'))).toEqual(msg('sw:token.clear'))
		expect(decodeSwMessage(msg('sw:token.none'))).toEqual(msg('sw:token.none'))
		expect(decodeSwMessage(msg('sw:apikey.set', { payload: { apiKey: 'k' }, id: 5 }))).toEqual(
			msg('sw:apikey.set', { payload: { apiKey: 'k' }, id: 5 })
		)
		expect(decodeSwMessage(msg('sw:apikey.get.req', { id: 7 }))).toEqual(
			msg('sw:apikey.get.req', { id: 7 })
		)
		expect(decodeSwMessage(msg('sw:apikey.del'))).toEqual(msg('sw:apikey.del'))
		expect(decodeSwMessage(msg('sw:key.set', { payload: { key: 'aaa' } }))).toEqual(
			msg('sw:key.set', { payload: { key: 'aaa' } })
		)
		expect(decodeSwMessage(msg('sw:key.reset', { id: 3 }))).toEqual(
			msg('sw:key.reset', { id: 3 })
		)
		expect(decodeSwMessage(msg('sw:claim'))).toEqual(msg('sw:claim'))
	})

	it('accepts sw:key.reset and sw:apikey.set without an id (notify, not request)', () => {
		expect(decodeSwMessage(msg('sw:key.reset'))).toEqual(msg('sw:key.reset'))
		expect(decodeSwMessage(msg('sw:apikey.set', { payload: { apiKey: 'k' } }))).toEqual(
			msg('sw:apikey.set', { payload: { apiKey: 'k' } })
		)
	})

	it('rejects a wrong or missing protocol version', () => {
		expect(decodeSwMessage(msg('sw:claim', { v: PROTOCOL_VERSION + 1 }))).toBeNull()
		expect(decodeSwMessage({ cloudillo: true, type: 'sw:claim' })).toBeNull()
	})

	it('rejects anything that is not ours', () => {
		expect(decodeSwMessage({ v: PROTOCOL_VERSION, type: 'sw:claim' })).toBeNull()
		expect(
			decodeSwMessage({ cloudillo: false, v: PROTOCOL_VERSION, type: 'sw:claim' })
		).toBeNull()
		expect(decodeSwMessage(msg('sw:something.else'))).toBeNull()
		expect(decodeSwMessage(null)).toBeNull()
		expect(decodeSwMessage('sw:claim')).toBeNull()
	})

	it('rejects a known type whose payload is missing or wrongly typed', () => {
		expect(decodeSwMessage(msg('sw:token.set'))).toBeNull()
		expect(decodeSwMessage(msg('sw:token.set', { payload: {} }))).toBeNull()
		expect(decodeSwMessage(msg('sw:token.set', { payload: { token: 42 } }))).toBeNull()
		expect(decodeSwMessage(msg('sw:apikey.set', { payload: { apiKey: null } }))).toBeNull()
		expect(decodeSwMessage(msg('sw:key.set', { payload: { key: ['a'] } }))).toBeNull()
		// `id` is what the reply is correlated with — a string wouldn't match.
		expect(decodeSwMessage(msg('sw:apikey.get.req'))).toBeNull()
		expect(decodeSwMessage(msg('sw:apikey.get.req', { id: '7' }))).toBeNull()
	})

	it('drops extra top-level keys instead of rejecting', () => {
		// `swRequest` adds `id` to every message it sends, including types whose
		// schema has no `id` — dropping unknown fields is what lets that work.
		expect(decodeSwMessage(msg('sw:token.clear', { id: 9, extra: 'x' }))).toEqual(
			msg('sw:token.clear')
		)
	})

	it('does not decode worker -> page messages', () => {
		expect(
			decodeSwMessage(msg('sw:apikey.get.res', { replyTo: 1, data: { apiKey: 'k' } }))
		).toBeNull()
		expect(decodeSwMessage(msg('sw:token.request'))).toBeNull()
	})
})

describe('decodeSwInbound', () => {
	it('accepts every worker -> page type', () => {
		expect(
			decodeSwInbound(
				msg('sw:apikey.get.res', { replyTo: 1, ok: true, data: { apiKey: 'k' } })
			)
		).toEqual(msg('sw:apikey.get.res', { replyTo: 1, ok: true, data: { apiKey: 'k' } }))
		expect(decodeSwInbound(msg('sw:key.reset.ack', { replyTo: 2, data: {} }))).toEqual(
			msg('sw:key.reset.ack', { replyTo: 2, data: {} })
		)
		expect(
			decodeSwInbound(msg('sw:apikey.set.ack', { replyTo: 3, ok: true, data: {} }))
		).toEqual(msg('sw:apikey.set.ack', { replyTo: 3, ok: true, data: {} }))
		// The failure the ack exists for: the worker had no key and stored nothing.
		expect(
			decodeSwInbound(
				msg('sw:apikey.set.ack', { replyTo: 3, ok: false, error: 'no-encryption-key' })
			)
		).toEqual(msg('sw:apikey.set.ack', { replyTo: 3, ok: false, error: 'no-encryption-key' }))
		expect(decodeSwInbound(msg('sw:token.request'))).toEqual(msg('sw:token.request'))
	})

	it('rejects a wrong version, a foreign envelope and an unknown type', () => {
		expect(decodeSwInbound(msg('sw:token.request', { v: 99 }))).toBeNull()
		expect(decodeSwInbound({ v: PROTOCOL_VERSION, type: 'sw:token.request' })).toBeNull()
		expect(decodeSwInbound(msg('sw:token.answer'))).toBeNull()
	})

	it('rejects a reply whose correlation id is missing or wrongly typed', () => {
		expect(decodeSwInbound(msg('sw:apikey.get.res', { data: { apiKey: 'k' } }))).toBeNull()
		expect(decodeSwInbound(msg('sw:apikey.get.res', { replyTo: '1' }))).toBeNull()
		expect(decodeSwInbound(msg('sw:apikey.get.res', { replyTo: 1, ok: 'yes' }))).toBeNull()
	})

	it('does not decode page -> worker messages', () => {
		expect(decodeSwInbound(msg('sw:token.set', { payload: { token: 'tok' } }))).toBeNull()
		expect(decodeSwInbound(msg('sw:claim'))).toBeNull()
	})
})

// vim: ts=4
