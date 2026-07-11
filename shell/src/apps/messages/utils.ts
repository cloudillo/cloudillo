// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createdAtToSeconds } from '../../read-position.js'
import type { ActionEvt } from './types.js'

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
}

// Annotate each message with `showSender`/`showTimestamp`: true at the start of a
// visual group (sender change or a >5min gap from the previous message), so the
// sender card and timestamp render only once per run of consecutive messages.
export function groupMessages(msgs: ActionEvt[]): GroupedMsg[] {
	return msgs.map((action, i) => {
		const prev = msgs[i - 1]
		const newGroup =
			!prev ||
			prev.issuer.idTag !== action.issuer.idTag ||
			createdAtToSeconds(action.createdAt) - createdAtToSeconds(prev.createdAt) >
				GROUP_GAP_SEC
		return { action, showSender: newGroup, showTimestamp: newGroup }
	})
}

// vim: ts=4
