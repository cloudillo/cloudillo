// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ReaderStatePatch } from '@cloudillo/core'
import {
	Button,
	IcCheck,
	IcFolder,
	IcMore,
	IcPin,
	Menu,
	MenuDivider,
	MenuHeader,
	MenuItem,
	type MenuPosition,
	SubMenuItem,
	useApi,
	useDialog,
	useToast
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { useCtx } from '../../../context/index.js'
import { IcLeave, IcMute, IcRestore, IcUnpin, IcUnread } from '../../../icons.js'
import { unreadCountAtom } from '../../../read-position.js'
import { messagesPath } from '../../../routes.js'
import { useTouchGestures } from '../../../ui/touch-gestures.js'
import { useConversationsReload } from '../hooks/useConversations.js'
import { useConvPrefs } from '../hooks/useConvPrefs.js'
import type { Conversation } from '../types.js'

// Live unread of a row: the header-badge key, or the muted one (grey count).
export function rowUnread(counts: Record<string, number>, c: Conversation): number {
	return counts[`msg:${c.id}`] || counts[`msgMuted:${c.id}`] || 0
}

export interface ConvActions {
	unread: boolean
	run: (patch: ReaderStatePatch) => void
	togglePin: () => void
	toggleRead: () => void
	toggleArchive: () => void
	mute: (notify: 'T' | 'M' | null, hours?: number) => void
	leave: () => void
}

export function useConvActions(c: Conversation): ConvActions {
	const { t } = useTranslation()
	const { api } = useApi()
	const dialog = useDialog()
	const toast = useToast()
	const navigate = useNavigate()
	const { convId } = useParams()
	const base = useCtx().base
	const setPrefs = useConvPrefs()
	const reload = useConversationsReload()
	const unread = rowUnread(useAtomValue(unreadCountAtom), c) > 0 || !!c.readerState?.unreadFlag

	function run(patch: ReaderStatePatch) {
		setPrefs(c, patch).catch(() => toast.error(t('Could not update the conversation')))
	}

	return {
		unread,
		run,
		togglePin: () => run({ pinned: c.pinned ? null : true }),
		toggleRead: () =>
			run(
				unread
					? { readAt: c.lastMessageAt ?? new Date().toISOString(), unreadFlag: null }
					: { unreadFlag: true }
			),
		toggleArchive: () => run({ archived: c.archived ? null : true }),
		mute: (notify, hours) =>
			run({
				notify,
				notifyUntil:
					notify && hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null
			}),
		leave: async () => {
			if (!api || !c.ownerTag) return
			const ok = await dialog.confirm(
				t('Leave Group'),
				t('Are you sure you want to leave "{{name}}"?', { name: c.name })
			)
			if (!ok) return
			try {
				// subject = CONV id retires the join SUBS,
				// audience = group node makes it federate there.
				await api.actions.create({
					type: 'SUBS',
					subType: 'DEL',
					subject: c.id,
					audienceTag: c.ownerTag
				})
				reload()
				if (convId === c.id) navigate(messagesPath(base), { replace: true })
			} catch (err) {
				console.error('Failed to leave group', err)
				toast.error(t('Could not leave the group'))
			}
		}
	}
}

// The mute choices: "All messages", then each level × duration.
export function MuteMenuItems({
	muteLevel,
	onMute
}: {
	muteLevel: Conversation['muteLevel']
	onMute: ConvActions['mute']
}) {
	const { t } = useTranslation()
	const durations: [string, number | undefined][] = [
		[t('For 1 hour'), 1],
		[t('For 8 hours'), 8],
		[t('For 1 week'), 24 * 7],
		[t('Until I turn it back on'), undefined]
	]
	const levels: [string, 'T' | 'M'][] = [
		[t('Mentions only'), 'T'],
		[t('Nothing'), 'M']
	]
	return (
		<>
			<MenuItem label={t('All messages')} checked={!muteLevel} onClick={() => onMute(null)} />
			{levels.map(([levelLabel, notify]) => (
				<React.Fragment key={notify}>
					<MenuHeader>{levelLabel}</MenuHeader>
					{durations.map(([durLabel, hours]) => (
						<MenuItem
							key={durLabel}
							label={durLabel}
							aria-label={`${levelLabel}: ${durLabel}`}
							onClick={() => onMute(notify, hours)}
						/>
					))}
				</React.Fragment>
			))}
		</>
	)
}

export interface RowActionsProps {
	conversation: Conversation
	actions: ConvActions
	/** Context-menu mode (long-press / right-click): open at this point while mounted.
	 *  Omitted: renders the `⋯` trigger button. */
	position?: MenuPosition
	onClose?: () => void
}

// Per-row actions: Pin, Mute submenu, Mark read/unread, Archive, Leave.
export function RowActions({ conversation: c, actions: a, position, onClose }: RowActionsProps) {
	const { t } = useTranslation()
	// Left groups have no reader-state row to patch and nothing to leave.
	if (c.left) return null

	const muteLabel =
		c.muteLevel === 'mentions'
			? t('Mentions only')
			: c.muteLevel === 'none'
				? t('Nothing')
				: t('All messages')

	const items = (
		<>
			<MenuItem
				icon={c.pinned ? <IcUnpin /> : <IcPin />}
				label={c.pinned ? t('Unpin') : t('Pin')}
				onClick={a.togglePin}
			/>
			<SubMenuItem icon={<IcMute />} label={t('Notifications')} detail={muteLabel}>
				<MuteMenuItems muteLevel={c.muteLevel} onMute={a.mute} />
			</SubMenuItem>
			<MenuItem
				icon={a.unread ? <IcCheck /> : <IcUnread />}
				label={a.unread ? t('Mark as read') : t('Mark as unread')}
				onClick={a.toggleRead}
			/>
			<MenuItem
				icon={c.archived ? <IcRestore /> : <IcFolder />}
				label={c.archived ? t('Unarchive') : t('Archive')}
				onClick={a.toggleArchive}
			/>
			{c.type === 'group' && (
				<>
					<MenuDivider />
					<MenuItem icon={<IcLeave />} label={t('Leave')} danger onClick={a.leave} />
				</>
			)}
		</>
	)

	return position ? (
		<Menu position={position} onClose={onClose}>
			{items}
		</Menu>
	) : (
		<Menu
			placement="bottom-end"
			trigger={
				<Button
					variant="ghost"
					size="sm"
					icon={<IcMore />}
					aria-label={t('Conversation actions')}
				/>
			}
		>
			{items}
		</Menu>
	)
}

// Touch/pointer paths to the row actions: right-click and long-press open the menu at
// the point; a horizontal swipe toggles archive (left) or read/unread (right); the row
// just follows the finger, with no revealed action background. Spread `rowProps` on the
// row and render `<RowActions conversation={c} actions={a} position={menuAt}
// onClose={closeMenu} />` while `menuAt` is set.
export function useRowGestures(c: Conversation, a: ConvActions) {
	const [menuAt, setMenuAt] = React.useState<MenuPosition>()
	const { handlers, swipeX } = useTouchGestures({
		enabled: !c.left,
		onMenu: setMenuAt,
		onSwipeLeft: a.toggleArchive,
		onSwipeRight: a.toggleRead
	})
	return {
		rowProps: {
			...handlers,
			style: swipeX ? { transform: `translateX(${swipeX}px)` } : undefined
		},
		menuAt,
		closeMenu: () => setMenuAt(undefined)
	}
}

// vim: ts=4
