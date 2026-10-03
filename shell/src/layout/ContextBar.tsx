// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The top bar's context tier: the personal tile plus the pinned community chips.
 *
 * Context is the parent axis — it scopes every destination and the URL spells it first
 * (`/<ctx>/<section>/…`) — so it sits in the global-nav position and the apps take the
 * left rail. `lg`+ only; below that the contexts are the community sheet (see
 * `layout/CommunitySheet.tsx`) and this renders nothing.
 *
 * The strip is capped by breakpoint rather than scrolled: 4 chips at `lg`, 6 at `xl`, the
 * remainder folds into the `[▦]` popup. A long community name, or a Hungarian one, pushes
 * chips into that overflow instead of breaking the row.
 *
 * Reorder is one `SortableGroup` spanning the strip and the popup's finder cards: a chip
 * drags along the strip, a card drags out of the popup onto a chosen strip position.
 */

import { HBox, SortableGroup, Tag, useAuth, useIsDesktop } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLayoutGrid as IcGrid } from 'react-icons/lu'

import { getFileIcon } from '../apps/files/icons.js'
import {
	activeContextAtom,
	type CommunityRef,
	previewCommunityAtom,
	useCommunitiesList,
	useContextSwitchNav,
	useGuestDocument
} from '../context/index.js'
import { useHatEntry } from '../context/hat-entry.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { unreadCountAtom } from '../read-position.js'
import { appPath, ctxBase } from '../routes.js'
import { ContextChip } from '../ui/ContextChip.js'
import { ContextStrip } from '../ui/ContextStrip.js'
import { CommunityPopup } from './CommunityPopup.js'
import { pinDropIndex } from './community-sections.js'
import { truncateFileName } from './Menu.js'

interface StripEntry {
	community: CommunityRef
	/** Index into `favorites` — what `pinDropIndex` counts */
	index: number
}

/** Strip keys are prefixed: a pinned community is also a card in the popup's finder. */
const stripKey = (e: StripEntry) => `strip:${e.community.idTag}`

export function ContextBar() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [guestDocument] = useGuestDocument()
	const activeContext = useAtomValue(activeContextAtom)
	const previewCommunity = useAtomValue(previewCommunityAtom)
	const unreadCounts = useAtomValue(unreadCountAtom)
	const { favorites, pinnedIdTags, pinCommunityAt } = useCommunitiesList()
	const handleSwitch = useContextSwitchNav()
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
	const { changeHat } = useHatEntry()
	const isWide = useIsDesktop('xl')

	const cap = isWide ? 6 : 4
	const entries: StripEntry[] = favorites.map((community, index) => ({ community, index }))
	let visible = entries.slice(0, cap)
	// The active context is always on the strip, even past the cap: it is the one chip
	// whose absence would leave the bar lying about where the user is.
	const activeHidden = activeContext
		? entries.slice(cap).find((e) => e.community.idTag === activeContext.idTag)
		: undefined
	if (activeHidden) visible = [...visible.slice(0, cap - 1), activeHidden]
	const visibleTags = new Set(visible.map((e) => e.community.idTag))
	const hidden = entries.filter((e) => !visibleTags.has(e.community.idTag))
	const hiddenUnread = hidden.some((e) => !!unreadCounts[e.community.idTag])

	/** Pin `idTag` before `favorites[favIndex]` (at the end past the last). */
	function pinBefore(idTag: string, favIndex: number) {
		pinCommunityAt(idTag, pinDropIndex(pinnedIdTags, favorites, idTag, favIndex))
	}

	// `to` counts strip slots: within the strip it is arrayMove semantics; from the popup
	// (`group` set) it is the insertion slot and `key` is the card's idTag.
	function onStripReorder(from: number, to: number, group?: string, key?: string) {
		if (group) {
			if (!key) return
			pinBefore(
				key,
				to < visible.length ? visible[to].index : (visible.at(-1)?.index ?? -1) + 1
			)
			return
		}
		const moved = visible[from]
		const target = visible[to]
		if (!moved || !target) return
		pinBefore(moved.community.idTag, to > from ? target.index + 1 : target.index)
	}

	// Guests: no communities, no rail — the strip carries the document they followed a
	// share link to, and who owns it.
	if (!auth) {
		if (!guestDocument) return null
		const isAppDoc = !!guestDocument.appId // CRDT/RTDB set appId; BLOB/FLDR set ''
		const DocIcon = getFileIcon(guestDocument.contentType, guestDocument.fileTp)
		return (
			<HBox gap={1} className="c-ctx-bar sm-hide md-hide" aria-label={t('Context')}>
				<ContextChip
					idTag={guestDocument.ownerIdTag}
					name={guestDocument.ownerIdTag}
					title={guestDocument.ownerIdTag}
				/>
				<Tag
					className="c-ctx-chip"
					title={guestDocument.fileName}
					icon={DocIcon && <DocIcon />}
					href={
						isAppDoc
							? appPath(
									ctxBase(guestDocument.ownerIdTag, undefined),
									guestDocument.appId,
									guestDocument.resId,
									guestDocument.accessLevel !== 'write'
										? { access: guestDocument.accessLevel }
										: undefined
								)
							: `/s/${guestDocument.refId}`
					}
				>
					{truncateFileName(guestDocument.fileName, 20)}
				</Tag>
			</HBox>
		)
	}

	const meActive = activeContext?.idTag === auth.idTag

	/** The worn hat (active) or remembered one (inactive partner): badge + "B · via A" label. */
	function hatLabel({ idTag, name, hat: remembered }: CommunityRef) {
		const hat = activeContext?.idTag === idTag ? activeContext.hat : remembered
		return hat
			? {
					hat,
					label: t('{{community}} · via {{hat}}', {
						community: name,
						hat: hat.name ?? hat.idTag
					})
				}
			: undefined
	}

	function renderChip({ community }: StripEntry) {
		const worn = hatLabel(community)
		return (
			<ContextChip
				idTag={community.idTag}
				profilePic={community.profilePic}
				pending={community.isPending}
				unread={!!unreadCounts[community.idTag]}
				name={community.name}
				hat={worn?.hat}
				active={activeContext?.idTag === community.idTag}
				aria-label={
					community.isPending
						? t('{{name}} (setting up)', { name: community.name })
						: (worn?.label ?? community.name)
				}
				title={
					community.isPending
						? t('DNS propagation in progress...')
						: (worn?.label ?? community.name)
				}
				onClick={wrapClick(() => handleSwitch(community.idTag))}
				{...getTriggerProps({
					idTag: community.idTag,
					name: community.name,
					type: 'community'
				})}
			/>
		)
	}

	// WCAG 2.5.7: chips have no drag handle, so the menu of a pinned chip moves it too.
	const menuFav = menuState ? favorites.findIndex((c) => c.idTag === menuState.target.idTag) : -1
	const moveTo = (favIndex: number) => () => pinBefore(favorites[menuFav].idTag, favIndex)
	const menuOnActive =
		menuState?.target.type === 'community' && menuState.target.idTag === activeContext?.idTag
	const previewWorn = previewCommunity && hatLabel(previewCommunity)

	return (
		<>
			<SortableGroup>
				<ContextStrip
					className="sm-hide md-hide"
					aria-label={t('Context switcher')}
					group="strip"
					items={visible}
					getKey={stripKey}
					getLabel={(e) => e.community.name}
					onReorder={onStripReorder}
					renderChip={renderChip}
					leading={
						<ContextChip
							idTag={auth.idTag ?? ''}
							profilePic={auth.profilePic}
							unread={!!unreadCounts[auth.idTag ?? '']}
							active={meActive}
							aria-label={t('My profile')}
							onClick={wrapClick(() => handleSwitch(auth.idTag!))}
							{...getTriggerProps({
								idTag: auth.idTag!,
								name: auth.name ?? auth.idTag!,
								type: 'me'
							})}
						/>
					}
					trailing={
						<>
							{/* The active community when it is not pinned at all; its menu pins it. */}
							{previewCommunity && (
								<ContextChip
									idTag={previewCommunity.idTag}
									profilePic={previewCommunity.profilePic}
									name={previewCommunity.name}
									hat={previewWorn?.hat}
									preview
									active
									aria-label={t('Currently viewing {{name}} (not pinned)', {
										name: previewWorn?.label ?? previewCommunity.name
									})}
									title={previewWorn?.label ?? previewCommunity.name}
									onClick={wrapClick(() => handleSwitch(previewCommunity.idTag))}
									{...getTriggerProps({
										idTag: previewCommunity.idTag,
										name: previewCommunity.name,
										type: 'community'
									})}
								/>
							)}
							<CommunityPopup
								icon={<IcGrid />}
								overflowCount={hidden.length}
								overflowUnread={hiddenUnread}
								draggable
							/>
						</>
					}
				/>
			</SortableGroup>

			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
					onMoveLeft={menuFav > 0 ? moveTo(menuFav - 1) : undefined}
					onMoveRight={
						menuFav !== -1 && menuFav < favorites.length - 1
							? moveTo(menuFav + 2)
							: undefined
					}
					onChangeIdentity={
						menuOnActive
							? () => {
									changeHat(menuState.target.idTag).catch((err) =>
										console.error('[ContextBar] Change identity failed:', err)
									)
								}
							: undefined
					}
				/>
			)}
		</>
	)
}

// vim: ts=4
