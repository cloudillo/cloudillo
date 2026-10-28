// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Per-conversation composer drafts in localStorage. Every access is guarded: with
// storage unavailable (private mode, quota, sandbox) the composer simply keeps none.
// Keyed per account, so a draft never shows up under another login on this browser.

import { authAtom } from '@cloudillo/react'
import { getDefaultStore } from 'jotai'

export const DRAFT_PREFIX = 'messages.draft.'
const draftKey = (convId: string) =>
	`${DRAFT_PREFIX}${getDefaultStore().get(authAtom)?.idTag ?? '-'}.${convId}`

export function loadDraft(convId: string): string {
	try {
		return localStorage.getItem(draftKey(convId)) ?? ''
	} catch {
		return ''
	}
}

export function saveDraft(convId: string, text: string): void {
	try {
		if (text.trim()) localStorage.setItem(draftKey(convId), text)
		else localStorage.removeItem(draftKey(convId))
	} catch {
		// no storage: drafts are best-effort
	}
}

export function clearDraft(convId: string): void {
	saveDraft(convId, '')
}

// vim: ts=4
