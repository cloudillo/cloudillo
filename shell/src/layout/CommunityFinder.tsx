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

import {
	Badge,
	Button,
	HBox,
	Heading,
	IdentityTag,
	mergeClasses,
	SearchInput,
	SortableList,
	Text,
	useAuth,
	VBox
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPin as IcPin, LuPinOff as IcPinOff, LuUserRound as IcProfile } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

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
import { ContextAvatar, ContextChip } from '../ui/ContextChip.js'
import { buildCommunitySections } from './community-sections.js'

interface CommunityCardProps {
	community: CommunityRef
	isActive: boolean
	isPinned: boolean
	onSwitch: () => void
	onTogglePin: () => void
	onProfile: () => void
}

function CommunityCard({
	community,
	isActive,
	isPinned,
	onSwitch,
	onTogglePin,
	onProfile
}: CommunityCardProps) {
	const { t } = useTranslation()
	const unreadCounts = useAtomValue(unreadCountAtom)
	const { idTag, name, isPending, unreadCount } = community
	const pinLabel = isPinned ? t('Unpin {{name}}', { name }) : t('Pin {{name}}', { name })
	const profileLabel = t('View profile of {{name}}', { name })

	return (
		<HBox
			className={mergeClasses('c-community-card', isActive && 'active')}
			aria-current={isActive ? 'true' : undefined}
		>
			<Button variant="ghost" className="c-community-card-main" onClick={onSwitch}>
				<ContextAvatar
					idTag={idTag}
					profilePic={community.profilePic}
					pending={isPending}
					unread={!!unreadCounts[idTag]}
				/>
				<VBox className="c-community-card-text">
					<Text weight="medium" truncate>
						{name}
					</Text>
					<Text size="xs" emphasis="muted" truncate>
						<IdentityTag idTag={idTag} />
						{isPending && ` · ${t('Setting up...')}`}
					</Text>
				</VBox>
				{!isPending && unreadCount > 0 && <Badge color="error">{unreadCount}</Badge>}
			</Button>
			<Button
				kind="nav-link"
				className="c-community-card-action"
				onClick={onTogglePin}
				aria-label={pinLabel}
				aria-pressed={isPinned}
			>
				{isPinned ? <IcPinOff /> : <IcPin />}
			</Button>
			<Button
				kind="nav-link"
				className="c-community-card-action"
				onClick={onProfile}
				aria-label={profileLabel}
			>
				<IcProfile />
			</Button>
		</HBox>
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
		<HBox
			scroll
			gap={2}
			className="c-community-pinned"
			role="toolbar"
			aria-label={t('Pinned communities')}
		>
			{entries.map((entry) => {
				const label = entry.type === 'me' ? t('My profile') : entry.name
				return (
					<ContextChip
						key={entry.idTag}
						orientation="vertical"
						idTag={entry.idTag}
						profilePic={entry.profilePic}
						pending={entry.isPending}
						unread={!!unreadCounts[entry.idTag]}
						count={entry.unreadCount || undefined}
						name={entry.name}
						active={activeContext?.idTag === entry.idTag}
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
					/>
				)
			})}
			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
				/>
			)}
		</HBox>
	)
}

export interface CommunityFinderProps {
	variant: 'popup' | 'sheet'
	/** Close the surface — after a switch or a navigation. */
	onDone: () => void
	/** Inside a `SortableGroup` (desktop popup): cards drag onto the context strip. */
	draggable?: boolean
}

/** Source-only card lists never receive a reorder; the strip's list handles the drop. */
const noReorder = () => {}

export function CommunityFinder({ variant, onDone, draggable }: CommunityFinderProps) {
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

	const renderCard = (community: CommunityRef) => (
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
		/>
	)

	return (
		<VBox className={mergeClasses('c-community-finder', variant)}>
			{variant === 'sheet' && <PinnedRow onDone={onDone} />}
			<SearchInput
				value={query}
				placeholder={t('Find a community…')}
				aria-label={t('Find a community…')}
				// The popup is opened to type into; on mobile, don't pop the keyboard
				// over the list unasked.
				autoFocus={variant === 'popup'}
				onChange={(evt) => setQuery(evt.target.value)}
			/>
			<VBox className="c-community-finder-list">
				{sections.map((section) => (
					<VBox key={section.key} className="c-community-finder-section">
						<Heading level={6} overline>
							{titles[section.key]}
						</Heading>
						{draggable ? (
							// Keys are bare idTags: the sections are disjoint, and the strip
							// reads the key of a dropped card as its idTag.
							<SortableList
								items={section.rows}
								getKey={(c) => c.idTag}
								getLabel={(c) => c.name}
								group={`finder-${section.key}`}
								sortable={false}
								handle={false}
								onReorder={noReorder}
								className="c-community-finder-rows"
								renderItem={renderCard}
							/>
						) : (
							<VBox className="c-community-finder-rows">
								{section.rows.map(renderCard)}
							</VBox>
						)}
					</VBox>
				))}
				{!sections.length && (
					<Text as="p" emphasis="muted" className="p-2">
						{communities.length
							? t('No community matches.')
							: t('You are not a member of any community yet.')}
					</Text>
				)}
			</VBox>
			<VBox className="c-community-finder-footer">
				{variant === 'sheet' && <ContextTools onNavigate={onDone} />}
				<Button variant="link" href={scopePath(ctx.base, 'communities')} onClick={onDone}>
					{t('Manage all')} →
				</Button>
			</VBox>
		</VBox>
	)
}

// vim: ts=4
