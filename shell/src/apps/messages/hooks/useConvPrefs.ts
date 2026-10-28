// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ReaderStatePatch } from '@cloudillo/core'
import { useApi } from '@cloudillo/react'
import type { ReaderState } from '@cloudillo/types'
import { useSetAtom } from 'jotai'
import * as React from 'react'

import { createdAtToSeconds } from '../../../read-position.js'
import type { Conversation } from '../types.js'
import { conversationsAtom, readerStateFields, useConversationsReload } from './useConversations.js'

function readerKind(c: Conversation): 'P:MSG' | 'A:CONV' {
	return c.type === 'direct' ? 'P:MSG' : 'A:CONV'
}

// Mirror the server's PATCH rules on the loaded row (absent = unchanged, null = reset,
// readAt forward-only; an advance clears the unread flag unless patched) and re-derive
// the Conversation fields from it. The last message is untouched by prefs.
export function applyConvPatch(c: Conversation, patch: ReaderStatePatch): Conversation {
	const base: ReaderState = { kind: readerKind(c), ref: c.id, ...c.readerState }
	const { readAt, ...prefs } = patch
	const next: Record<string, unknown> = { ...base, ...prefs, updatedAt: new Date().toISOString() }
	for (const k of Object.keys(prefs)) {
		if (next[k] === null) delete next[k]
	}
	if (readAt !== undefined && createdAtToSeconds(readAt) > createdAtToSeconds(base.readAt)) {
		next.readAt = readAt
		if (createdAtToSeconds(readAt) >= createdAtToSeconds(base.lastAt)) next.unread = 0
		if (!('unreadFlag' in patch)) delete next.unreadFlag
	}
	return {
		...c,
		...readerStateFields(next as unknown as ReaderState),
		lastMessage: c.lastMessage,
		lastMessageAt: c.lastMessageAt
	}
}

// Change a conversation's reader-state prefs: optimistic write to conversationsAtom,
// then `PATCH /reader-state/{P:MSG|A:CONV}/{id}`. On failure the list reloads (the
// server is the truth) and the error is rethrown for the caller to report.
export function useConvPrefs(): (c: Conversation, patch: ReaderStatePatch) => Promise<void> {
	const { api } = useApi()
	const setConversations = useSetAtom(conversationsAtom)
	const reload = useConversationsReload()

	return React.useCallback(
		async function setConvPrefs(c: Conversation, patch: ReaderStatePatch) {
			if (!api) return
			setConversations((prev) =>
				prev?.map((x) =>
					x.id === c.id && x.type === c.type ? applyConvPatch(x, patch) : x
				)
			)
			try {
				await api.readerState.patch(readerKind(c), c.id, patch)
			} catch (err) {
				console.error('Failed to update conversation prefs', c.id, err)
				reload()
				throw err
			}
		},
		[api, setConversations, reload]
	)
}

// vim: ts=4
