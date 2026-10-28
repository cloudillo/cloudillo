// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Avatar,
	Badge,
	HBox,
	Icon,
	ListItem,
	ProfilePicture,
	Text,
	useAuth
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useCtx } from '../../../context/index.js'
import { IcGroup, IcHand, IcMute, IcPinned } from '../../../icons.js'
import { createdAtToSeconds, unreadCountAtom } from '../../../read-position.js'
import { messagesPath } from '../../../routes.js'
import { GroupAvatar } from '../components/GroupAvatar.js'
import { useTypists } from '../hooks/useTyping.js'
import type { Conversation } from '../types.js'
import { localDay } from '../utils.js'
import { RowActions, rowUnread, useConvActions, useRowGestures } from './RowActions.js'

export interface InboxRowProps {
	conversation: Conversation
	selected?: boolean
	/** Pending join requests (knocks) the viewer can answer; shown as an "N requests" chip. */
	requests?: number
}

// `14:02` today, `Mon` within the week, `21 Oct` (plus the year when not this year).
function rowTime(ts: string | number, lang: string): string {
	const sec = createdAtToSeconds(ts)
	const d = new Date(sec * 1000)
	const now = new Date()
	if (localDay(sec) === localDay(now.getTime() / 1000)) {
		return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
	}
	if (now.getTime() - d.getTime() < 6 * 86400_000) {
		return d.toLocaleDateString(lang, { weekday: 'short' })
	}
	return d.toLocaleDateString(lang, {
		day: 'numeric',
		month: 'short',
		year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric'
	})
}

function InboxRowComponent({ conversation: c, selected, requests }: InboxRowProps) {
	const { t, i18n } = useTranslation()
	const [auth] = useAuth()
	const base = useCtx().base
	const count = rowUnread(useAtomValue(unreadCountAtom), c)
	const a = useConvActions(c)
	const { rowProps, menuAt, closeMenu } = useRowGestures(c, a)
	// People typing here replace the preview with "X is typing…" in accent.
	const typing = useTypists(c.id)

	const muted = !!c.muteLevel
	const mentioned = !!c.mentioned && count > 0
	const peer = c.type === 'direct' ? c.profiles[0] : undefined
	const notConnected = !!peer && c.connected !== true
	// Groups hosted on another node show their host; for community groups that is the community.
	const host =
		c.type === 'group' && c.ownerTag && c.ownerTag !== auth?.idTag ? c.ownerTag : undefined
	const name = peer ? peer.name || peer.idTag : c.name || t('Unnamed Group')

	const m = c.lastMessage
	let preview: React.ReactNode
	if (typing.length) {
		preview = (
			<Text color="accent">
				{typing.length === 1
					? t('{{name}} is typing…', { name: typing[0].name })
					: t('{{count}} people are typing…', { count: typing.length })}
			</Text>
		)
	} else if (m) {
		const body =
			m.status === 'D'
				? t('Message deleted')
				: m.subType === 'IMG' ||
						(!(typeof m.content === 'string' && m.content.trim()) &&
							m.attachments?.length)
					? `📷 ${t('Photo')}`
					: typeof m.content === 'string'
						? m.content
						: ''
		const who =
			m.status === 'D'
				? undefined
				: m.issuer?.idTag === auth?.idTag
					? t('You')
					: c.type === 'group'
						? (m.issuer?.name || m.issuer?.idTag)?.split(' ')[0]
						: undefined
		preview = who ? `${who}: ${body}` : body
	} else if (c.type === 'group' && c.memberCount) {
		preview = t('{{count}} members', { count: c.memberCount })
	}

	const avatar = peer ? (
		<ProfilePicture profile={peer} />
	) : c.profiles.length > 1 ? (
		<GroupAvatar profiles={c.profiles} total={c.memberCount} />
	) : (
		<Avatar size="md" fallback={<Icon as={IcGroup} />} />
	)

	return (
		<>
			<ListItem
				{...rowProps}
				href={messagesPath(base, c.id)}
				selected={selected}
				leading={avatar}
				title={
					<HBox gap={2} align="baseline" className="w-min-0">
						<Text
							truncate
							className="flex-fill w-min-0"
							weight={count > 0 ? 'bold' : undefined}
						>
							{name}
						</Text>
						{c.lastMessageAt !== undefined && (
							<Text size="sm" emphasis="muted" className="inbox-row-time">
								<time
									dateTime={new Date(
										createdAtToSeconds(c.lastMessageAt) * 1000
									).toISOString()}
								>
									{rowTime(c.lastMessageAt, i18n.language)}
								</time>
							</Text>
						)}
					</HBox>
				}
				actions={<RowActions conversation={c} actions={a} />}
			>
				<HBox gap={1} align="center" className="w-min-0">
					<Text
						truncate
						size="sm"
						emphasis={count > 0 ? undefined : 'muted'}
						className="flex-fill w-min-0"
					>
						{host && <>@{host} · </>}
						{notConnected && <>{t('Not connected')} · </>}
						{c.left && <>{t('Left')} · </>}
						{preview}
					</Text>
					{!!requests && (
						<Badge
							size="sm"
							color="warning"
							icon={<IcHand />}
							aria-label={t('{{count}} requests', { count: requests })}
						>
							{requests}
						</Badge>
					)}
					{c.pinned && (
						<Icon as={IcPinned} label={t('Pinned')} className="inbox-row-ind" />
					)}
					{muted && <Icon as={IcMute} label={t('Muted')} className="inbox-row-ind" />}
					{mentioned && (
						<Badge size="sm" color="accent" aria-label={t('Mentioned')}>
							@
						</Badge>
					)}
					{count > 0 && (
						<Badge
							size="sm"
							color={muted ? 'neutral' : 'accent'}
							role="status"
							aria-label={t('{{count}} unread', { count })}
						>
							{count}
						</Badge>
					)}
				</HBox>
			</ListItem>
			{menuAt && (
				<RowActions conversation={c} actions={a} position={menuAt} onClose={closeMenu} />
			)}
		</>
	)
}

export const InboxRow = React.memo(InboxRowComponent)

// vim: ts=4
