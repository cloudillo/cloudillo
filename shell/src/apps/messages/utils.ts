// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ApiClient } from '@cloudillo/core'
import type { ActionView, Profile } from '@cloudillo/types'

import { createdAtToSeconds } from '../../read-position.js'
import type { ActionEvt } from './types.js'

/** Typeahead: connected people matching `q`, minus the `exclude` idTags (self, members). */
export async function listConnectedPeople(
	api: ApiClient | null | undefined,
	q: string,
	exclude: (string | undefined)[]
): Promise<Profile[] | undefined> {
	if (!api || !q) return []
	const profiles = await api.profiles.list({ q, connected: true, type: 'person' })
	const skip = new Set(exclude)
	return profiles?.filter((p) => !skip.has(p.idTag))
}

/** One member INVT per profile; resolves to the profiles whose invite failed. */
export async function sendInvites(
	api: ApiClient,
	convId: string,
	groupName: string | undefined,
	profiles: Profile[]
): Promise<Profile[]> {
	const results = await Promise.allSettled(
		profiles.map((p) =>
			api.actions.create({
				type: 'INVT',
				audienceTag: p.idTag,
				subject: convId,
				content: { role: 'member', groupName }
			})
		)
	)
	return profiles.filter((_p, i) => results[i].status === 'rejected')
}

// Action IDs always contain '~' (e.g. `a1~hash...`); idTags never do. Used to
// tell a group CONV id apart from a direct-message peer idTag.
export function isGroupId(convId: string): boolean {
	return convId.includes('~')
}

// Client-side temporary id for an optimistic (not-yet-confirmed) message. The
// `tmp~` prefix keeps it visually distinct and the `~` makes it look like an
// action id; reconciliation swaps it for the server's real actionId.
export function genTempId(): string {
	return `tmp~${crypto.randomUUID()}`
}

// Start a new visual group when the sender changes or the gap from the previous
// message exceeds this many seconds.
const GROUP_GAP_SEC = 5 * 60

export interface GroupedMsg {
	action: ActionEvt
	showSender: boolean
	showTimestamp: boolean
	// First message of a local calendar day (render a day separator before it)
	newDay: boolean
}

export function localDay(sec: number): string {
	return new Date(sec * 1000).toDateString()
}

// Annotate each message with `showSender`/`showTimestamp`: true at the start of a
// visual group (sender change, a >5min gap, or a new local day), so the sender
// card and timestamp render only once per run of consecutive messages.
export function groupMessages(msgs: ActionEvt[]): GroupedMsg[] {
	return msgs.map((action, i) => {
		const prev = msgs[i - 1]
		const ts = createdAtToSeconds(action.createdAt)
		const prevTs = prev ? createdAtToSeconds(prev.createdAt) : 0
		const newDay = !prev || localDay(ts) !== localDay(prevTs)
		const newGroup =
			!prev ||
			newDay ||
			prev.issuer.idTag !== action.issuer.idTag ||
			ts - prevTs > GROUP_GAP_SEC
		return { action, showSender: newGroup, showTimestamp: newGroup, newDay }
	})
}

// A group change drawn as a line in the timeline. A pending knock (SUBS 'C') and a
// preferences update (SUBS:UPD) are not.
export function isConvEvent(a: ActionView): boolean {
	switch (a.type as string) {
		case 'CONV':
			return !a.subType || a.subType === 'UPD'
		case 'SUBS':
			if (!a.subType) return !a.status || a.status === 'A' || a.status === 'D'
			return a.subType === 'DEL' || a.subType === 'ROLE'
		case 'INVT':
		case 'PIN':
			return !a.subType || a.subType === 'DEL'
		default:
			return false
	}
}

// Sort `add` into `prev` (oldest → newest), dropping ids already there.
export function mergeEvents(prev: ActionView[] | undefined, add: ActionView[]): ActionView[] {
	const have = new Set((prev || []).map((e) => e.actionId))
	return [...(prev || []), ...add.filter((e) => !have.has(e.actionId))].sort(
		(a, b) => createdAtToSeconds(a.createdAt) - createdAtToSeconds(b.createdAt)
	)
}

// Place each event before the first message not older than it. Events before the
// window's first message show only when nothing older is left to load; events after
// its last only at the live edge (else they belong to a page not yet loaded).
export function placeEvents(
	msgs: ActionView[],
	events: ActionView[],
	{ hasOlder, atLive }: { hasOlder: boolean; atLive: boolean }
): { before: ActionView[][]; after: ActionView[] } {
	const before: ActionView[][] = msgs.map(() => [])
	const after: ActionView[] = []
	const ts = msgs.map((m) => createdAtToSeconds(m.createdAt))
	for (const e of events) {
		const et = createdAtToSeconds(e.createdAt)
		const i = ts.findIndex((t) => et <= t)
		if (i < 0) {
			if (atLive || !msgs.length) after.push(e)
		} else if (i > 0 || !hasOlder) before[i].push(e)
	}
	return { before, after }
}

// vim: ts=4
