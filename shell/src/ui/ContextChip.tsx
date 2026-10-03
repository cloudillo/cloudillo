// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A context (me or a community) as a chip on R `Tag` — the context strip, the
 * community sheet's pinned row (`orientation="vertical"` tile) and the finder cards
 * (`ContextAvatar` alone).
 *
 * Contexts are rounded squares; the account-menu avatar stays a circle and shares no class
 * with these — shape is what tells "a context" from "me, the signed-in user". State is never
 * carried by shape alone: the active chip also gets a filled pill and `aria-current`.
 */

import { Badge, BadgeAnchor, mergeClasses, ProfilePicture, Tag } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuClock3 as IcPending } from 'react-icons/lu'

import './context-strip.css'

export interface ContextAvatarProps {
	idTag: string
	profilePic?: string
	/** DNS propagation still running: a clock instead of the unread badge */
	pending?: boolean
	unread?: boolean
	/** Unread count; shown instead of the dot */
	count?: number
	/** Worn hat (the context is entered via this community): ringed mini avatar */
	hat?: { idTag: string; profilePic?: string }
	className?: string
}

/** A context's squircle avatar with its pending clock or unread badge. */
export function ContextAvatar({
	idTag,
	profilePic,
	pending,
	unread,
	count,
	hat,
	className
}: ContextAvatarProps) {
	const { t } = useTranslation()
	const badge = pending ? undefined : count ? (
		<Badge color="error" size="sm" aria-hidden="true">
			{count}
		</Badge>
	) : unread ? (
		<Badge dot color="accent" aria-label={t('New content')} />
	) : undefined
	return (
		<BadgeAnchor className={mergeClasses('c-ctx-chip-avatar', className)} badge={badge}>
			<ProfilePicture profile={{ profilePic }} srcTag={idTag} shape="squircle" />
			{pending && (
				<span className="c-ctx-chip-pending" title={t('Setting up...')}>
					<IcPending />
				</span>
			)}
			{hat && (
				<span className="c-ctx-chip-hat c-hat-ring">
					<ProfilePicture
						profile={{ profilePic: hat.profilePic }}
						srcTag={hat.idTag}
						size="xs"
					/>
				</span>
			)}
		</BadgeAnchor>
	)
}

export interface ContextChipProps
	extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick' | 'color'>,
		Omit<ContextAvatarProps, 'className'> {
	/** Visible label; omit for the icon-only personal tile */
	name?: React.ReactNode
	active?: boolean
	/** The active community when it is not pinned: dashed avatar */
	preview?: boolean
	/** `vertical`: avatar over name, the sheet's pinned-row tile */
	orientation?: 'horizontal' | 'vertical'
	/** Without it the chip is static */
	onClick?: React.MouseEventHandler<HTMLElement>
}

export function ContextChip({
	idTag,
	profilePic,
	pending,
	unread,
	count,
	hat,
	name,
	active,
	preview,
	orientation = 'horizontal',
	onClick,
	className,
	...props
}: ContextChipProps) {
	return (
		<Tag
			className={mergeClasses(
				'c-ctx-chip',
				orientation === 'vertical' && 'vertical',
				active && 'active',
				preview && 'preview',
				!onClick && 'static',
				className
			)}
			avatar={
				<ContextAvatar
					idTag={idTag}
					profilePic={profilePic}
					pending={pending}
					unread={unread}
					count={count}
					hat={hat}
				/>
			}
			onClick={onClick}
			aria-current={active ? 'true' : undefined}
			data-ctx-chip=""
			{...props}
		>
			{name && <span className="c-ctx-chip-name">{name}</span>}
		</Tag>
	)
}

// vim: ts=4
