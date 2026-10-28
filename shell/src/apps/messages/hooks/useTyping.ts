// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { useApi, useAuth } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import { atom, useAtomValue, useSetAtom, useStore } from 'jotai'
import * as React from 'react'

import { useWsBus, type WsBusMsg } from '../../../ws-bus.js'
import type { Conversation } from '../types.js'
import { conversationsAtom } from './useConversations.js'

export interface Typist {
	idTag: string
	name: string
}

/** convId (CONV id, or the peer idTag for a DM) → who is typing there now */
export const typingAtom = atom<Record<string, Typist[]>>({})

/** PRES:TYPING is sent at most this often while typing (none after the last keystroke) */
const SEND_EVERY_MS = 2500
/** A typist is dropped this long after their last PRES:TYPING */
const TYPING_EXPIRE_MS = 5000

const NONE: Typist[] = []
const timers = new Map<string, ReturnType<typeof setTimeout>>()
// `useWsBus` replays `lastMsg` to every subscriber on mount: never handle a frame twice.
const handled = new WeakSet<WsBusMsg>()

/** `typingAtom` reducer: add/replace a typist, or remove one by idTag (same object if absent). */
export function applyTypist(
	prev: Record<string, Typist[]>,
	convId: string,
	typist: Typist | string
): Record<string, Typist[]> {
	const idTag = typeof typist === 'string' ? typist : typist.idTag
	const rest = (prev[convId] ?? NONE).filter((x) => x.idTag !== idTag)
	if (typeof typist === 'string') {
		if (!prev[convId]?.some((x) => x.idTag === idTag)) return prev
		if (rest.length) return { ...prev, [convId]: rest }
		const { [convId]: _dropped, ...others } = prev
		return others
	}
	return { ...prev, [convId]: [...rest, typist] }
}

/**
 * The conversation a PRES:TYPING belongs to, or undefined to drop it. A DM's subject
 * is its receiver (us), so the conversation is the sender; a group subject must be a
 * known, joined group the issuer is a member of.
 */
export function typingConvId(
	a: ActionView,
	me: string,
	convs: Conversation[] | undefined
): string | undefined {
	const idTag = a.issuer?.idTag
	if (!idTag || idTag === me) return
	if (a.subject === me) return idTag
	const conv = convs?.find((c) => c.id === a.subject)
	if (!conv || conv.left || conv.type !== 'group') return
	if (!conv.profiles.some((p) => p.idTag === idTag)) return
	return conv.id
}

/**
 * Feeds `typingAtom` from PRES:TYPING (and clears a typist when their MSG lands).
 * Mount once wherever the messages UI is open; a replay of an old frame shows for
 * at most `TYPING_EXPIRE_MS`.
 */
export function useTypingReceiver() {
	const [auth] = useAuth()
	const setTyping = useSetAtom(typingAtom)
	const store = useStore()

	const update = React.useCallback(
		(convId: string, typist: Typist | string) => {
			setTyping((prev) => applyTypist(prev, convId, typist))
		},
		[setTyping]
	)

	React.useEffect(
		() => () => {
			for (const t of timers.values()) clearTimeout(t)
			timers.clear()
			setTyping({})
		},
		[setTyping]
	)

	useWsBus({ cmds: ['ACTION'] }, function handleTyping(m) {
		if (handled.has(m)) return
		handled.add(m)
		const a = m.data as ActionView
		const me = auth?.idTag
		const idTag = a?.issuer?.idTag
		if (!me || !idTag || idTag === me) return

		if (a.type === 'PRES' && a.subType === 'TYPING') {
			const convId = typingConvId(a, me, store.get(conversationsAtom))
			if (!convId) return
			const key = `${convId}\0${idTag}`
			clearTimeout(timers.get(key))
			timers.set(
				key,
				setTimeout(() => {
					timers.delete(key)
					update(convId, idTag)
				}, TYPING_EXPIRE_MS)
			)
			update(convId, { idTag, name: a.issuer.name || idTag })
		} else if (a.type === 'MSG') {
			// Their message landed: they stopped typing (group MSG parent = CONV, DM none)
			const convId = a.parentId || idTag
			const key = `${convId}\0${idTag}`
			clearTimeout(timers.get(key))
			timers.delete(key)
			update(convId, idTag)
		}
	})
}

/** The people typing in `convId` right now (stable empty array when nobody is). */
export function useTypists(convId: string | undefined): Typist[] {
	const all = useAtomValue(typingAtom)
	return (convId && all[convId]) || NONE
}

/**
 * Returns the composer's keystroke callback: sends PRES:TYPING on the first keystroke,
 * then at most every `SEND_EVERY_MS`. Group: audience = the CONV owner, who relays it
 * to the members; DM: straight to the peer.
 */
export function useTypingSender(convId: string | undefined, conversation?: Conversation) {
	const { api } = useApi()
	const lastRef = React.useRef({ convId: '', at: 0 })

	return React.useCallback(() => {
		if (!api || !convId || !conversation) return
		const group = conversation.type === 'group'
		const audienceTag = group ? conversation.ownerTag : convId
		if (!audienceTag) return
		const now = Date.now()
		const last = lastRef.current
		if (last.convId === convId && now - last.at < SEND_EVERY_MS) return
		lastRef.current = { convId, at: now }
		api.actions
			.create({
				type: 'PRES',
				subType: 'TYPING',
				subject: convId,
				audienceTag,
				// Members' nodes admit the owner's relay as a child of the CONV they hold, as a MSG
				...(group && { parentId: convId })
			})
			.catch(() => {})
	}, [api, convId, conversation])
}

// vim: ts=4
