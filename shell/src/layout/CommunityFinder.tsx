// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The community finder body, shared by the desktop `[▦]` popup and the mobile community
 * sheet: search over the user's own communities, a list of cards (switch / pin / profile),
 * and — sheet only — the pinned row with the personal tile first.
 *
 * The DOM order is always pinned → search → list → footer, so Tab order reads the same on
 * both. The sheet flips it visually (`column-reverse`) to put the pinned row and the
 * search field next to the thumb, with the best match right above the input.
 */

import { Button, IdentityTag, mergeClasses, useAuth } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPin as IcPin,
	LuPinOff as IcPinOff,
	LuUserRound as IcProfile,
	LuSearch as IcSearch
} from 'react-icons/lu'
import { Link, useNavigate } from 'react-router-dom'

import {
	activeContextAtom,
	type CommunityRef,
	ContextTools,
	communitiesAtom,
	recentCommunitiesAtom,
	useCommunitiesList,
	useContextSwitchNav,
	useCtx
} from '../context/index.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { unreadCountAtom } from '../read-position.js'
import { profilePath, scopePath } from '../routes.js'
import { ChipAvatar } from './ChipAvatar.js'
import { buildCommunitySections } from './community-sections.js'

interface CommunityCardProps {
	community: CommunityRef
	isActive: boolean
	isPinned: boolean
	onSwitch: () => void
	onTogglePin: () => void
	onProfile: () => void
	onDragStart?: () => void
	onDragEnd?: () => void
}

function CommunityCard({
	community,
	isActive,
	isPinned,
	onSwitch,
	onTogglePin,
	onProfile,
	onDragStart,
	onDragEnd
}: CommunityCardProps) {
	const { t } = useTranslation()
	const unreadCounts = useAtomValue(unreadCountAtom)
	const { idTag, name, isPending, unreadCount } = community
	const pinLabel = isPinned ? t('Unpin {{name}}', { name }) : t('Pin {{name}}', { name })
	const profileLabel = t('View profile of {{name}}', { name })

	return (
		<div
			className={mergeClasses('c-community-card', isActive && 'active')}
			aria-current={isActive ? 'true' : undefined}
			draggable={!!onDragStart}
			onDragStart={
				onDragStart &&
				((evt) => {
					evt.dataTransfer.effectAllowed = 'move'
					onDragStart()
				})
			}
			onDragEnd={onDragEnd}
		>
			<button type="button" className="c-community-card-main" onClick={onSwitch}>
				<ChipAvatar
					idTag={idTag}
					profilePic={community.profilePic}
					pending={isPending}
					unread={!!unreadCounts[idTag]}
					iconSize={12}
				/>
				<span className="c-community-card-text">
					<span className="c-community-card-name">{name}</span>
					<span className="c-community-card-sub text-muted">
						<IdentityTag idTag={idTag} />
						{isPending && ` · ${t('Setting up...')}`}
					</span>
				</span>
				{!isPending && unreadCount > 0 && (
					<span className="c-badge bg-error">{unreadCount}</span>
				)}
			</button>
			<Button
				kind="nav-link"
				className="c-community-card-action"
				onClick={onTogglePin}
				aria-label={pinLabel}
				title={pinLabel}
				aria-pressed={isPinned}
			>
				{isPinned ? <IcPinOff /> : <IcPin />}
			</Button>
			<Button
				kind="nav-link"
				className="c-community-card-action"
				onClick={onProfile}
				aria-label={profileLabel}
				title={profileLabel}
			>
				<IcProfile />
			</Button>
		</div>
	)
}

/** Sheet only: the personal tile, then the pinned communities, as a horizontal scroller. */
function PinnedRow({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const activeContext = useAtomValue(activeContextAtom)
	const unreadCounts = useAtomValue(unreadCountAtom)
	const { favorites } = useCommunitiesList()
	const handleSwitch = useContextSwitchNav()
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()

	if (!auth?.idTag) return null

	const entries = [
		{
			idTag: auth.idTag,
			name: auth.name ?? auth.idTag,
			profilePic: auth.profilePic,
			isPending: false,
			unreadCount: 0,
			type: 'me' as const
		},
		...favorites.map((c) => ({ ...c, isPending: !!c.isPending, type: 'community' as const }))
	]

	return (
		<div className="c-community-pinned" role="toolbar" aria-label={t('Pinned communities')}>
			{entries.map((entry) => {
				const isActive = activeContext?.idTag === entry.idTag
				const label = entry.type === 'me' ? t('My profile') : entry.name
				return (
					<button
						key={entry.idTag}
						type="button"
						className={mergeClasses('c-community-pinned-item', isActive && 'active')}
						aria-current={isActive ? 'true' : undefined}
						aria-label={
							entry.isPending ? t('{{name}} (setting up)', { name: label }) : label
						}
						title={entry.name}
						onClick={wrapClick(() => {
							handleSwitch(entry.idTag)
							onDone()
						})}
						{...getTriggerProps({
							idTag: entry.idTag,
							name: entry.name,
							type: entry.type
						})}
					>
						<ChipAvatar
							idTag={entry.idTag}
							profilePic={entry.profilePic}
							pending={entry.isPending}
							unread={!!unreadCounts[entry.idTag]}
							iconSize={12}
						>
							{!entry.isPending && entry.unreadCount > 0 && (
								<span className="c-badge bg-error positioned br" aria-hidden="true">
									{entry.unreadCount}
								</span>
							)}
						</ChipAvatar>
						<span className="c-community-pinned-name">{entry.name}</span>
					</button>
				)
			})}
			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
				/>
			)}
		</div>
	)
}

export interface CommunityFinderProps {
	variant: 'popup' | 'sheet'
	/** Close the surface — after a switch, a navigation, or a drop onto the strip. */
	onDone: () => void
	/** Desktop only: dragging a card onto the context strip pins it there. */
	onDragStartRow?: (idTag: string) => void
	onDragEndRow?: () => void
}

export function CommunityFinder({
	variant,
	onDone,
	onDragStartRow,
	onDragEndRow
}: CommunityFinderProps) {
	const { t } = useTranslation()
	const ctx = useCtx()
	const navigate = useNavigate()
	const activeContext = useAtomValue(activeContextAtom)
	const communities = useAtomValue(communitiesAtom)
	const recentCommunities = useAtomValue(recentCommunitiesAtom)
	const { favorites, toggleFavorite } = useCommunitiesList()
	const handleSwitch = useContextSwitchNav()
	const [query, setQuery] = React.useState('')

	const pinnedTags = new Set(favorites.map((c) => c.idTag))
	const sections = buildCommunitySections(communities, recentCommunities, query)
	const titles = { recent: t('Recent'), all: t('All'), results: t('Results') }

	return (
		<div className={mergeClasses('c-community-finder', variant)}>
			{variant === 'sheet' && <PinnedRow onDone={onDone} />}
			<div className="c-input-group">
				<IcSearch className="c-input-icon" />
				<input
					className="c-input"
					type="search"
					value={query}
					placeholder={t('Find a community…')}
					aria-label={t('Find a community…')}
					// The popup is opened to type into; on mobile, don't pop the keyboard
					// over the list unasked.
					autoFocus={variant === 'popup'}
					onChange={(evt) => setQuery(evt.target.value)}
				/>
			</div>
			<div className="c-community-finder-list">
				{sections.map((section) => (
					<div key={section.key} className="c-community-finder-section">
						<h6>{titles[section.key]}</h6>
						<div className="c-community-finder-rows">
							{section.rows.map((community) => (
								<CommunityCard
									key={community.idTag}
									community={community}
									isActive={activeContext?.idTag === community.idTag}
									isPinned={pinnedTags.has(community.idTag)}
									onSwitch={() => {
										handleSwitch(community.idTag)
										onDone()
									}}
									onTogglePin={() => toggleFavorite(community.idTag)}
									onProfile={() => {
										navigate(profilePath(ctx.base, community.idTag))
										onDone()
									}}
									onDragStart={
										onDragStartRow && (() => onDragStartRow(community.idTag))
									}
									onDragEnd={
										onDragStartRow &&
										(() => {
											onDragEndRow?.()
											onDone()
										})
									}
								/>
							))}
						</div>
					</div>
				))}
				{!sections.length && (
					<p className="text-muted p-2">
						{communities.length
							? t('No community matches.')
							: t('You are not a member of any community yet.')}
					</p>
				)}
			</div>
			<div className="c-community-finder-footer">
				{variant === 'sheet' && <ContextTools onNavigate={onDone} />}
				<Link to={scopePath(ctx.base, 'communities')} onClick={onDone}>
					{t('Manage all')} →
				</Link>
			</div>
		</div>
	)
}

// vim: ts=4
