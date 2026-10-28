// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Typing indicators: which conversation a PRES:TYPING belongs to, the `typingAtom`
 * reducer, and the receiver's expiry/unmount timers.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import type { ActionView } from '@cloudillo/types'
import { act, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import * as React from 'react'

import { mockCloudilloReact } from './helpers/mocks.js'

const ME = 'me.test'
const PEER = 'peer.test'
const GROUP = 'a1~conv'

type Handler = (m: { cmd: string; data: unknown }) => void
let wsHandler: Handler = () => {}
jest.unstable_mockModule('../ws-bus.js', () => ({
	useWsBus: (_opts: unknown, h: Handler) => {
		wsHandler = h
	}
}))
await mockCloudilloReact({ useAuth: () => [{ idTag: ME }], useApi: () => ({}) })

const { applyTypist, typingConvId, useTypingReceiver, useTypists } = await import(
	'../apps/messages/hooks/useTyping.js'
)
const { conversationsAtom } = await import('../apps/messages/hooks/useConversations.js')
type Conversation = import('../apps/messages/types.js').Conversation

function conv(over: Partial<Conversation> = {}): Conversation {
	return { id: GROUP, type: 'group', profiles: [{ idTag: PEER }], ...over } as Conversation
}

function typing(issuer: string, subject: string): ActionView {
	return {
		actionId: 'p1',
		type: 'PRES',
		subType: 'TYPING',
		issuer: { idTag: issuer, name: 'Peer' },
		subject,
		createdAt: 1
	} as ActionView
}

describe('typingConvId', () => {
	it('a DM (subject = me) belongs to the sender', () => {
		expect(typingConvId(typing(PEER, ME), ME, [])).toBe(PEER)
	})

	it('accepts a known group the issuer is a member of', () => {
		expect(typingConvId(typing(PEER, GROUP), ME, [conv()])).toBe(GROUP)
	})

	it('rejects an unknown subject, a non-member, a left group and own frames', () => {
		// Members not loaded yet → nobody is a known member
		expect(typingConvId(typing('x.test', GROUP), ME, [conv({ profiles: [] })])).toBeUndefined()
		expect(typingConvId(typing(PEER, 'a1~other'), ME, [conv()])).toBeUndefined()
		expect(typingConvId(typing(PEER, GROUP), ME, undefined)).toBeUndefined()
		expect(typingConvId(typing('x.test', GROUP), ME, [conv()])).toBeUndefined()
		expect(typingConvId(typing(PEER, GROUP), ME, [conv({ left: true })])).toBeUndefined()
		expect(typingConvId(typing(ME, PEER), ME, [])).toBeUndefined()
	})
})

describe('applyTypist', () => {
	const a = { idTag: 'a.test', name: 'A' }
	const b = { idTag: 'b.test', name: 'B' }

	it('adds and replaces', () => {
		const one = applyTypist({}, 'c', a)
		expect(one).toEqual({ c: [a] })
		expect(applyTypist(one, 'c', { ...a, name: 'A2' })).toEqual({ c: [{ ...a, name: 'A2' }] })
		expect(applyTypist(one, 'c', b)).toEqual({ c: [a, b] })
	})

	it('removes; the last one drops the key; an unknown one keeps the same object', () => {
		const two = { c: [a, b] }
		expect(applyTypist(two, 'c', 'a.test')).toEqual({ c: [b] })
		expect(applyTypist({ c: [a] }, 'c', 'a.test')).toEqual({})
		expect(applyTypist(two, 'c', 'z.test')).toBe(two)
		expect(applyTypist(two, 'd', 'a.test')).toBe(two)
	})
})

describe('useTypingReceiver', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	afterEach(() => {
		jest.useRealTimers()
	})

	it('shows a typist, expires them, and clears timers on unmount', () => {
		const store = createStore()
		store.set(conversationsAtom, [conv()])
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<Provider store={store}>{children}</Provider>
		)
		const { result, unmount } = renderHook(
			() => {
				useTypingReceiver()
				return useTypists(GROUP)
			},
			{ wrapper }
		)

		act(() => wsHandler({ cmd: 'ACTION', data: typing(PEER, GROUP) }))
		expect(result.current.map((t) => t.idTag)).toEqual([PEER])

		act(() => {
			jest.advanceTimersByTime(5000)
		})
		expect(result.current).toEqual([])

		act(() => wsHandler({ cmd: 'ACTION', data: typing(PEER, GROUP) }))
		expect(jest.getTimerCount()).toBe(1)
		unmount()
		expect(jest.getTimerCount()).toBe(0)
	})
})

// vim: ts=4
