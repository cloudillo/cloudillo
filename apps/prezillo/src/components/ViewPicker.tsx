// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * ViewPicker component - Navigation bar for views/slides
 */

import { presenceColor } from '@cloudillo/core'
import {
	Button,
	Dialog,
	IcAdd,
	IcDropdown,
	IcFullscreen,
	IcLink,
	IcNext,
	IcPrev,
	IcShare,
	IcSidebar,
	monogramFor,
	useDarkMode,
	useNearSet,
	useOutsideClick
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { getFollowerCount } from '../awareness'
import type { ViewId, ViewNode } from '../crdt'
import type { UsePrezilloDocumentResult } from '../hooks/usePrezilloDocument'
import type { TemplateWithUsage } from '../hooks/useTemplates'
import { IcAudience, IcOwner, IcPlay, IcStop } from '../icons'
import { mergeClasses } from '../utils'
import type { SlideMenuCmds } from './SlideMenu'
import type { ViewOccupants } from './SlideThumbnail'
import { SlideMenu, useSlideMenu } from './SlideMenu'
import { SlideThumbnail } from './SlideThumbnail'

/** View navigation commands */
export interface ViewPickerCmds {
	onViewSelect: (id: ViewId) => void
	onAddView: () => void
	onPrevView: () => void
	onNextView: () => void
}

/** Presentation commands */
export interface ViewPickerPresentCmds {
	onPresent: (fullscreen?: boolean) => void
	onStopPresenting?: () => void
	onFollow?: (clientId: number) => void
	onUnfollow?: () => void
	onSharePresent?: () => void
	onShareFollow?: () => void
}

export interface ViewPickerProps extends SlideMenuCmds {
	prezillo: UsePrezilloDocumentResult
	views: ViewNode[]
	cmds: ViewPickerCmds
	presentCmds: ViewPickerPresentCmds
	readOnly?: boolean
	/** Whether the device is mobile - the counter opens the slide picker popup */
	isMobile?: boolean
	/** Whether the slides rail is shown (desktop) */
	railOpen?: boolean
	/** Toggle the slides rail; absent = no toggle button */
	onToggleRail?: () => void
	/** DOM id of the slides rail (`aria-controls`) */
	railId?: string
	/** Some slide is not skipped (default: any slide) */
	canPresent?: boolean
	/** Template markers in the mobile slide picker */
	templates?: TemplateWithUsage[]
	/** Collaborators per slide, for the mobile slide picker */
	viewOccupants?: ReadonlyMap<ViewId, ViewOccupants>
}

/**
 * SlidePickerPopup - Mobile slide picker: a 2-column thumbnail grid
 */
interface SlidePickerPopupProps extends SlideMenuCmds {
	prezillo: UsePrezilloDocumentResult
	views: ViewNode[]
	activeViewId: ViewId | null
	templates: TemplateWithUsage[]
	viewOccupants?: ReadonlyMap<ViewId, ViewOccupants>
	readOnly?: boolean
	onSelect: (id: ViewId) => void
	onClose: () => void
}

function SlidePickerPopup({
	prezillo,
	views,
	activeViewId,
	templates,
	viewOccupants,
	readOnly,
	onSelect,
	onClose,
	...menuCmds
}: SlidePickerPopupProps) {
	const { t } = useTranslation()
	const gridRef = React.useRef<HTMLElement>(null)
	const slideMenu = useSlideMenu(gridRef, readOnly)
	const near = useNearSet(gridRef, '.c-slide-thumb[data-view-id]', 'viewId', [views])

	return (
		<Dialog open title={t('Go to slide')} onClose={onClose}>
			<nav ref={gridRef} className="c-slide-picker-grid" aria-label={t('Slides')}>
				{views.map((view, index) => (
					<SlideThumbnail
						key={view.id}
						view={view}
						index={index}
						doc={prezillo.doc}
						templates={templates}
						active={view.id === activeViewId}
						near={near.has(view.id)}
						ownerTag={prezillo.cloudillo.ownerTag}
						token={prezillo.cloudillo.token}
						onSelect={onSelect}
						onKeyDown={readOnly ? undefined : (e) => slideMenu.onMenuKey(e, view.id)}
						onContextMenu={
							readOnly
								? undefined
								: (e) => {
										// Anchored, not at the pointer: a pointer-placed menu
										// portals outside the modal, where it is inert
										e.preventDefault()
										slideMenu.open(view.id, e.currentTarget)
									}
						}
						onMore={readOnly ? undefined : (anchor) => slideMenu.open(view.id, anchor)}
						occupants={viewOccupants?.get(view.id)}
					/>
				))}
			</nav>
			{slideMenu.menu && (
				<SlideMenu
					menu={slideMenu.menu}
					views={views}
					onClose={slideMenu.close}
					{...menuCmds}
				/>
			)}
		</Dialog>
	)
}

export function ViewPicker({
	prezillo,
	views,
	cmds,
	presentCmds,
	readOnly,
	isMobile = false,
	railOpen = false,
	onToggleRail,
	railId,
	canPresent = views.length > 0,
	templates = [],
	viewOccupants,
	...menuCmds
}: ViewPickerProps) {
	const { activeViewId, isPresenting, activePresenters, followingClientId, awareness } = prezillo
	const { onViewSelect, onAddView, onPrevView, onNextView } = cmds
	const { onPresent, onStopPresenting, onFollow, onUnfollow, onSharePresent, onShareFollow } =
		presentCmds
	const { t } = useTranslation()
	const dark = useDarkMode()
	const activeIndex = views.findIndex((v) => v.id === activeViewId)
	const counter = views.length > 0 ? `${activeIndex + 1} / ${views.length}` : '0 / 0'

	// Mobile slide picker popup state
	const [showSlidePicker, setShowSlidePicker] = React.useState(false)

	// Presenter dropdown state
	const [showPresenterDropdown, setShowPresenterDropdown] = React.useState(false)
	const presenterRef = React.useRef<HTMLDivElement>(null)

	// Close presenter dropdown on outside click
	useOutsideClick(presenterRef, () => setShowPresenterDropdown(false), showPresenterDropdown)

	// Handle follow/unfollow
	const handleFollowClick = React.useCallback(
		(clientId: number) => {
			if (followingClientId === clientId) {
				onUnfollow?.()
			} else {
				onFollow?.(clientId)
			}
			setShowPresenterDropdown(false)
		},
		[followingClientId, onFollow, onUnfollow]
	)

	// Present dropdown state
	const [showPresentDropdown, setShowPresentDropdown] = React.useState(false)
	const presentDropdownRef = React.useRef<HTMLDivElement>(null)

	// Close present dropdown on outside click
	useOutsideClick(presentDropdownRef, () => setShowPresentDropdown(false), showPresentDropdown)

	// Handle slide picker selection
	const handleSlideSelect = React.useCallback(
		(id: ViewId) => {
			onViewSelect(id)
			setShowSlidePicker(false)
		},
		[onViewSelect]
	)

	return (
		<div className="c-nav c-hbox p-1 gap-1">
			{!isMobile && onToggleRail && (
				<Button
					variant="filled"
					icon={<IcSidebar />}
					active={railOpen}
					immediate
					onClick={onToggleRail}
					title={railOpen ? t('Hide slides (Ctrl+Alt+1)') : t('Show slides (Ctrl+Alt+1)')}
					aria-label={t('Slides')}
					aria-expanded={railOpen}
					aria-controls={railId}
					aria-keyshortcuts="Control+Alt+1"
				/>
			)}

			{isPresenting ? (
				<button
					onClick={onStopPresenting}
					className="c-button icon me-2 presenting"
					title={t('Stop presenting')}
				>
					<IcStop />
				</button>
			) : (
				<div ref={presentDropdownRef} className="c-present-split me-2">
					<button
						onClick={() => onPresent(false)}
						className="c-button icon c-present-split__main"
						title={t('Present in window')}
						disabled={!canPresent}
					>
						<IcPlay />
					</button>
					<button
						onClick={() => setShowPresentDropdown(!showPresentDropdown)}
						className="c-button icon c-present-split__caret"
						title={t('Presentation options')}
						aria-label={t('Presentation options')}
						aria-expanded={showPresentDropdown}
						disabled={!canPresent}
					>
						<IcDropdown />
					</button>
					{showPresentDropdown && (
						<div className="c-present-split__dropdown">
							<button
								className="c-present-split__option"
								onClick={() => {
									onPresent(false)
									setShowPresentDropdown(false)
								}}
							>
								<IcPlay />
								<span>{t('Present in window')}</span>
							</button>
							{document.fullscreenEnabled && (
								<button
									className="c-present-split__option"
									onClick={() => {
										onPresent(true)
										setShowPresentDropdown(false)
									}}
								>
									<IcFullscreen />
									<span>{t('Present fullscreen')}</span>
								</button>
							)}
							{(onSharePresent || onShareFollow) && (
								<>
									<div className="c-present-split__divider" />
									{onSharePresent && (
										<button
											className="c-present-split__option"
											onClick={() => {
												onSharePresent()
												setShowPresentDropdown(false)
											}}
										>
											<IcShare />
											<span>{t('Share for presenting')}</span>
										</button>
									)}
									{onShareFollow && (
										<button
											className="c-present-split__option"
											onClick={() => {
												onShareFollow()
												setShowPresentDropdown(false)
											}}
										>
											<IcAudience />
											<span>{t('Share for following')}</span>
										</button>
									)}
								</>
							)}
						</div>
					)}
				</div>
			)}

			<button
				onClick={onPrevView}
				className="c-button icon"
				disabled={activeIndex <= 0}
				title={t('Previous slide')}
			>
				<IcPrev />
			</button>

			{/* Mobile: the counter opens the slide picker; desktop: the rail navigates */}
			{isMobile ? (
				<button
					className="c-button view-picker-counter flex-fill"
					onClick={() => setShowSlidePicker(true)}
					title={t('Tap to select slide')}
				>
					{counter}
				</button>
			) : (
				<span className="view-picker-counter">{counter}</span>
			)}

			<button
				onClick={onNextView}
				className="c-button icon"
				disabled={activeIndex >= views.length - 1}
				title={t('Next slide')}
			>
				<IcNext />
			</button>

			{!readOnly && (
				<button onClick={onAddView} className="c-button icon" title={t('Add slide')}>
					<IcAdd />
				</button>
			)}

			{/* Presenter indicator - inside toolbar */}
			{activePresenters.length > 0 && (
				<div ref={presenterRef} className="c-presenter-indicator-inline">
					<button
						className={mergeClasses(
							'c-button c-presenter-indicator-btn',
							followingClientId !== null && 'following'
						)}
						onClick={() => setShowPresenterDropdown(!showPresenterDropdown)}
						title={t('{{count}} presenters active', { count: activePresenters.length })}
					>
						<span className="c-presenter-indicator-btn__dot">
							<span className="c-presenter-indicator-btn__pulse" />
						</span>
						<span className="c-presenter-indicator-btn__label">
							{activePresenters.length} {t('live')}
						</span>
						{followingClientId !== null && (
							<IcLink className="c-presenter-indicator-btn__link" />
						)}
						<IcDropdown
							className={mergeClasses(
								'c-presenter-indicator-btn__caret',
								showPresenterDropdown && 'open'
							)}
						/>
					</button>

					{showPresenterDropdown && (
						<div className="c-presenter-indicator__dropdown">
							{activePresenters.map((presenter) => {
								const isFollowing = followingClientId === presenter.clientId
								const slideNum = presenter.viewIndex + 1
								const followerCount = awareness
									? getFollowerCount(awareness, presenter.clientId)
									: 0

								return (
									<div
										key={presenter.clientId}
										className={mergeClasses(
											'c-presenter-indicator__item',
											presenter.isOwner && 'owner'
										)}
									>
										<div
											className="c-presenter-indicator__avatar"
											style={{
												backgroundColor: presenceColor(
													presenter.user.idTag,
													presenter.clientId,
													dark
												)
											}}
										>
											{monogramFor(presenter.user.idTag, presenter.user.name)}
										</div>
										<div className="c-presenter-indicator__info">
											<div className="c-presenter-indicator__name">
												{presenter.user.name}
												{presenter.isOwner && (
													<IcOwner
														className="c-presenter-indicator__owner-badge"
														title={t('Owner')}
													/>
												)}
											</div>
											<div className="c-presenter-indicator__slide">
												{t('Slide')} {slideNum}/{views.length}
												{followerCount > 0 && (
													<span className="c-presenter-indicator__followers">
														{' · '}
														{followerCount}{' '}
														{t('follower', {
															count: followerCount
														})}
													</span>
												)}
											</div>
										</div>
										<button
											className={`c-button xs${isFollowing ? ' accent' : ' primary'}`}
											onClick={() => handleFollowClick(presenter.clientId)}
										>
											{isFollowing ? t('Following') : t('Follow')}
										</button>
									</div>
								)
							})}
						</div>
					)}
				</div>
			)}

			{/* Mobile slide picker popup */}
			{isMobile && showSlidePicker && (
				<SlidePickerPopup
					prezillo={prezillo}
					views={views}
					activeViewId={prezillo.selectedTemplateId ? null : activeViewId}
					templates={templates}
					viewOccupants={viewOccupants}
					readOnly={readOnly}
					onSelect={handleSlideSelect}
					onClose={() => setShowSlidePicker(false)}
					{...menuCmds}
				/>
			)}
		</div>
	)
}

// vim: ts=4
