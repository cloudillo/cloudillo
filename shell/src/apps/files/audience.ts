// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import { absChannel, makeChannel, parseChannel, type useDialog } from '@cloudillo/react'
import type { TFunction } from 'i18next'

import { floorText } from '../../profile/role-labels.js'

/** Leaving a room (for the main drive or another room) changes who sees an item;
 *  main → room only narrows it, so that needs no confirm. */
export const leavesRoom = (src: string | null | undefined, target: string | null) =>
	!!src && src !== target

/** Landing in `target` widens who sees an item from `src`: it leaves its room, or its room is
 *  gone (the server falls back to the main drive) or not yet known. */
export function widensAudience(
	porch: PorchEntry[] | undefined,
	tenant: string,
	src: string | null | undefined,
	target: string | null
): boolean {
	if (!src) return false
	if (target === null || absChannel(src, tenant) !== absChannel(target, tenant)) return true
	const room = findRoom(porch, tenant, src)
	return !room || room === 'unknown'
}

/** Where a row's channel lives: `tenant` only when it names a context other than `contextIdTag`. */
export function channelTarget(
	channel: string | undefined,
	contextIdTag?: string
): { tenant?: string; drive: string | null } {
	if (!channel) return { drive: null }
	const { tenant, name } = parseChannel(channel)
	return { tenant: tenant && tenant !== contextIdTag ? tenant : undefined, drive: name }
}

/** The porch entry for `channel` on `tenant`; 'unknown' while the porch is still loading. */
export function findRoom(
	porch: PorchEntry[] | undefined,
	tenant: string,
	channel: string
): PorchEntry | undefined | 'unknown' {
	if (!porch) return 'unknown'
	return porch.find((r) => makeChannel(tenant, r.name) === absChannel(channel, tenant))
}

/** The update that reparents an entry to the target. `{parentId: null}` alone keeps the entry
 *  in its current drive, so a root target always names the drive: null = main, `@ctx~name` = room. */
export function reparentPatch(
	atRoot: boolean,
	currentFolderId: string | null,
	targetChannel: string | null
): { parentId: string | null; channel?: string | null } {
	return atRoot ? { parentId: null, channel: targetChannel } : { parentId: currentFolderId }
}

/**
 * Who a drive's files are visible to. `room`: `null` = the main drive, `undefined` = a room the
 * reader is not `in` (no audience data) → no line. Closed rooms: callers add the lock icon.
 */
export function audienceText(
	t: TFunction,
	contextName: string,
	room: PorchEntry | null | undefined,
	isHome = false
): string | undefined {
	if (room === null)
		return isHome ? t('Only you') : t('All {{context}} members', { context: contextName })
	if (!room) return undefined
	if (room.closed) {
		return room.memberCount != null
			? `${t('Invited members')} · ${t('{{count}} people', { count: room.memberCount })}`
			: t('Invited members')
	}
	if (room.minRole === null)
		return t('Everyone who can see {{context}}', { context: contextName })
	return room.minRole ? floorText(t, room.minRole) : undefined
}

/** Asks before items widen their audience, naming who will see them. */
export async function confirmAudienceDialog(
	dialog: ReturnType<typeof useDialog>,
	t: TFunction,
	title: string,
	audience: string
): Promise<boolean> {
	return !!(await dialog.confirm(
		title,
		t('They will be visible to {{audience}}.', { audience }),
		{
			confirmLabel: t('Continue')
		}
	))
}
