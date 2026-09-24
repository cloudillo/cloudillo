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
 */

import { mergeClasses, useAuth, useIsDesktop } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLayoutGrid as IcGrid, LuPin as IcPin } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { getFileIcon } from '../apps/files/icons.js'
import {
	activeContextAtom,
	type CommunityRef,
	previewCommunityAtom,
	useCommunitiesList,
	useContextSwitchNav,
	useGuestDocument
} from '../context/index.js'
import { ProfileContextMenu, useProfileContextMenu } from '../context/profile-context-menu.js'
import { unreadCountAtom } from '../read-position.js'
import { appPath, ctxBase } from '../routes.js'
import { ChipAvatar } from './ChipAvatar.js'
import { CommunityPopup } from './CommunityPopup.js'
import { pinDropIndex } from './community-sections.js'
import { truncateFileName } from './Menu.js'

/** What a drag currently carries: a strip chip (`index` set) or a popup row. */
export interface CommunityDrag {
	idTag: string
	index: number | null
}

export function ContextBar() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [guestDocument] = useGuestDocument()
	const activeContext = useAtomValue(activeContextAtom)
	const previewCommunity = useAtomValue(previewCommunityAtom)
	const unreadCounts = useAtomValue(unreadCountAtom)
	const { favorites, pinnedIdTags, pinCommunityAt, toggleFavorite } = useCommunitiesList()
	const handleSwitch = useContextSwitchNav()
	const { menuState, closeMenu, getTriggerProps, wrapClick } = useProfileContextMenu()
	const isWide = useIsDesktop('xl')
	const stripRef = React.useRef<HTMLDivElement | null>(null)
	const [drag, setDrag] = React.useState<CommunityDrag | null>(null)
	const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null)
	// Roving tabindex: which chip owns the strip's single tab stop, as a DOM-order slot
	// (personal tile, then `visible`, then the preview chip). Without it, tabbing away
	// and back always returns to the personal tile rather than the chip you left.
	const [focusIdx, setFocusIdx] = React.useState(0)

	const cap = isWide ? 6 : 4
	const entries = favorites.map((community, index) => ({ community, index }))
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

	const chipCount = 1 + visible.length + (previewCommunity ? 1 : 0)
	// Clamp: a chip can be unpinned or fall into the overflow while it holds the tab stop.
	const roving = Math.min(focusIdx, chipCount - 1)

	// One tab stop for the whole strip, arrows to move between chips — the usual
	// toolbar pattern, so a keyboard user doesn't tab through every community.
	function handleStripKeys(evt: React.KeyboardEvent) {
		const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
		if (!keys.includes(evt.key)) return
		// The popup's portal bubbles React events through here; leave its search input alone.
		if (!stripRef.current?.contains(evt.target as Node)) return
		const items = Array.from(
			stripRef.current?.querySelectorAll<HTMLElement>('[data-ctx-chip]') ?? []
		)
		if (!items.length) return
		const at = items.indexOf(document.activeElement as HTMLElement)
		evt.preventDefault()
		const next =
			evt.key === 'Home'
				? 0
				: evt.key === 'End'
					? items.length - 1
					: evt.key === 'ArrowRight'
						? (at + 1) % items.length
						: (at <= 0 ? items.length : at) - 1
		setFocusIdx(next)
		items[next]?.focus()
	}

	function dropAt(evt: React.DragEvent, index: number) {
		evt.preventDefault()
		setDragOverIndex(null)
		const current = drag
		setDrag(null)
		if (!current || current.index === index) return
		pinCommunityAt(current.idTag, pinDropIndex(pinnedIdTags, favorites, current.idTag, index))
	}

	/** What every chip in the strip shares: button role, roving tab stop, activation. */
	function chipButtonProps(slot: number, activate: () => void) {
		return {
			role: 'button',
			'data-ctx-chip': true,
			tabIndex: roving === slot ? 0 : -1,
			onFocus: () => setFocusIdx(slot),
			onClick: wrapClick(activate),
			onKeyDown: (evt: React.KeyboardEvent) => {
				if (evt.key === 'Enter' || evt.key === ' ') {
					evt.preventDefault()
					activate()
				}
			}
		}
	}

	function chipProps(index: number) {
		return {
			onDragOver: (evt: React.DragEvent) => {
				evt.preventDefault()
				setDragOverIndex(index)
			},
			onDrop: (evt: React.DragEvent) => dropAt(evt, index)
		}
	}

	// Guests: no communities, no rail — the strip carries the document they followed a
	// share link to, and who owns it.
	if (!auth) {
		if (!guestDocument) return null
		const isAppDoc = !!guestDocument.appId // CRDT/RTDB set appId; BLOB/FLDR set ''
		const DocIcon = getFileIcon(guestDocument.contentType, guestDocument.fileTp)
		return (
			<div className="c-ctx-bar g-1 sm-hide md-hide" aria-label={t('Context')}>
				<span className="c-ctx-chip static">
					<ChipAvatar idTag={guestDocument.ownerIdTag} />
					<span className="c-ctx-chip-name" title={guestDocument.ownerIdTag}>
						{guestDocument.ownerIdTag}
					</span>
				</span>
				<Link
					className="c-ctx-chip"
					title={guestDocument.fileName}
					to={
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
					{DocIcon && <DocIcon />}
					<span className="c-ctx-chip-name">
						{truncateFileName(guestDocument.fileName, 20)}
					</span>
				</Link>
			</div>
		)
	}

	const meActive = activeContext?.idTag === auth.idTag

	// `index` is the FAVORITES index — what the drag handlers and `chipProps` reorder on.
	// `slot` is the chip's DOM position in the strip, which is what the roving tab stop
	// counts. The two diverge as soon as a chip past the cap is pulled in as active.
	function renderChip(community: CommunityRef, index: number, slot: number) {
		const isActive = activeContext?.idTag === community.idTag
		return (
			<div
				key={community.idTag}
				className={mergeClasses(
					'c-ctx-chip',
					isActive && 'active',
					drag?.idTag === community.idTag && 'dragging',
					dragOverIndex === index && 'drag-over'
				)}
				{...chipButtonProps(slot + 1, () => handleSwitch(community.idTag))}
				aria-current={isActive ? 'true' : undefined}
				aria-label={
					community.isPending
						? t('{{name}} (setting up)', { name: community.name })
						: community.name
				}
				title={community.isPending ? t('DNS propagation in progress...') : community.name}
				draggable
				onDragStart={(evt) => {
					evt.dataTransfer.effectAllowed = 'move'
					setDrag({ idTag: community.idTag, index })
				}}
				onDragEnd={() => {
					setDrag(null)
					setDragOverIndex(null)
				}}
				{...chipProps(index)}
				{...getTriggerProps({
					idTag: community.idTag,
					name: community.name,
					type: 'community'
				})}
			>
				<ChipAvatar
					idTag={community.idTag}
					profilePic={community.profilePic}
					pending={community.isPending}
					unread={!community.isPending && !!unreadCounts[community.idTag]}
				/>
				<span className="c-ctx-chip-name">{community.name}</span>
			</div>
		)
	}

	return (
		<>
			{/* One tab stop: `role="toolbar"` is not itself focusable — focus lands on
			    the first chip and the arrow keys move it from there. */}
			<div
				ref={stripRef}
				className="c-ctx-bar g-1 sm-hide md-hide"
				role="toolbar"
				aria-label={t('Context switcher')}
				onKeyDown={handleStripKeys}
			>
				<div
					className={mergeClasses('c-ctx-chip me', meActive && 'active')}
					{...chipButtonProps(0, () => handleSwitch(auth.idTag!))}
					aria-label={t('My profile')}
					aria-current={meActive ? 'true' : undefined}
					onDragOver={(evt) => {
						evt.preventDefault()
						setDragOverIndex(0)
					}}
					onDrop={(evt) => dropAt(evt, 0)}
					{...getTriggerProps({
						idTag: auth.idTag!,
						name: auth.name ?? auth.idTag!,
						type: 'me'
					})}
				>
					<ChipAvatar
						idTag={auth.idTag ?? ''}
						profilePic={auth.profilePic}
						unread={!!unreadCounts[auth.idTag ?? '']}
					/>
				</div>

				{visible.map((entry, slot) => renderChip(entry.community, entry.index, slot))}

				{/* Trailing drop zone — pinning past the last chip. */}
				<div
					className={mergeClasses(
						'c-ctx-drop-zone',
						dragOverIndex === favorites.length && 'drag-over'
					)}
					onDragOver={(evt) => {
						evt.preventDefault()
						setDragOverIndex(favorites.length)
					}}
					onDrop={(evt) => dropAt(evt, favorites.length)}
				/>

				{/* The active community when it is not pinned at all: a preview chip
				    with a pin overlay. */}
				{previewCommunity && (
					<div
						className="c-ctx-chip preview"
						{...chipButtonProps(visible.length + 1, () =>
							handleSwitch(previewCommunity.idTag)
						)}
						aria-current="true"
						aria-label={t('Currently viewing {{name}} (not pinned)', {
							name: previewCommunity.name
						})}
						title={previewCommunity.name}
						{...getTriggerProps({
							idTag: previewCommunity.idTag,
							name: previewCommunity.name,
							type: 'community'
						})}
					>
						<ChipAvatar
							idTag={previewCommunity.idTag}
							profilePic={previewCommunity.profilePic}
						/>
						<span className="c-ctx-chip-name">{previewCommunity.name}</span>
						<button
							type="button"
							className="c-ctx-chip-pin"
							aria-label={t('Pin {{name}} to top bar', {
								name: previewCommunity.name
							})}
							onClick={(evt) => {
								evt.preventDefault()
								evt.stopPropagation()
								toggleFavorite(previewCommunity.idTag)
							}}
							// Keep the chip's Enter/Space handler from eating the native click.
							onKeyDown={(evt) => {
								if (evt.key === 'Enter' || evt.key === ' ') evt.stopPropagation()
							}}
						>
							<IcPin size={12} />
						</button>
					</div>
				)}

				<CommunityPopup
					icon={<IcGrid />}
					overflowCount={hidden.length}
					overflowUnread={hiddenUnread}
					onDragStartRow={(idTag) => setDrag({ idTag, index: null })}
					onDragEndRow={() => {
						setDrag(null)
						setDragOverIndex(null)
					}}
				/>
			</div>

			{menuState && (
				<ProfileContextMenu
					target={menuState.target}
					position={menuState.position}
					onClose={closeMenu}
				/>
			)}
		</>
	)
}

// vim: ts=4
