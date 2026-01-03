// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * PresenterIndicator - Shows active presenters in toolbar with dropdown
 *
 * Features:
 * - Compact badge showing presenter count
 * - Dropdown with presenter list (owner first)
 * - Follow button for each presenter
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiCaretDownBold as IcCaret,
	PiCrownBold as IcOwner,
	PiLinkBold as IcLink
} from 'react-icons/pi'

import type { PresenterInfo } from '../awareness'

export interface PresenterIndicatorProps {
	presenters: PresenterInfo[]
	followingClientId: number | null
	totalViews: number
	onFollow: (clientId: number) => void
	onUnfollow: () => void
	/** Mobile mode - shows compact pill instead of inline info */
	isMobile?: boolean
}

export function PresenterIndicator({
	presenters,
	followingClientId,
	totalViews,
	onFollow,
	onUnfollow,
	isMobile = false
}: PresenterIndicatorProps) {
	const { t } = useTranslation()
	const [isOpen, setIsOpen] = React.useState(false)
	const containerRef = React.useRef<HTMLDivElement>(null)

	// Close dropdown when clicking outside
	React.useEffect(() => {
		if (!isOpen) return

		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [isOpen])

	const handleFollowClick = React.useCallback(
		(clientId: number) => {
			if (followingClientId === clientId) {
				onUnfollow()
			} else {
				onFollow(clientId)
			}
			setIsOpen(false)
		},
		[followingClientId, onFollow, onUnfollow]
	)

	// Hide if no presenters (after all hooks)
	if (presenters.length === 0) {
		return null
	}

	// Single presenter
	if (presenters.length === 1) {
		const presenter = presenters[0]
		const isFollowing = followingClientId === presenter.clientId
		const slideNum = presenter.viewIndex + 1

		// Mobile: compact pill with dropdown
		if (isMobile) {
			return (
				<div ref={containerRef} className="c-presenter-indicator">
					<button
						className={`c-presenter-indicator__pill${isFollowing ? ' following' : ''}`}
						style={{ borderColor: presenter.user.color }}
						onClick={() => setIsOpen(!isOpen)}
						title={presenter.user.name}
					>
						<span
							className="c-presenter-indicator__pill-avatar"
							style={{ backgroundColor: presenter.user.color }}
						>
							{presenter.user.name.charAt(0).toUpperCase()}
						</span>
						{isFollowing && (
							<span className="c-presenter-indicator__pill-following">
								<IcLink size={12} />
							</span>
						)}
					</button>

					{isOpen && (
						<div className="c-presenter-indicator__dropdown">
							<div
								className={`c-presenter-indicator__item${presenter.isOwner ? ' owner' : ''}`}
							>
								<div
									className="c-presenter-indicator__avatar"
									style={{ backgroundColor: presenter.user.color }}
								>
									{presenter.user.name.charAt(0).toUpperCase()}
								</div>
								<div className="c-presenter-indicator__info">
									<div className="c-presenter-indicator__name">
										{presenter.user.name}
										{presenter.isOwner && (
											<IcOwner
												className="c-presenter-indicator__owner-badge"
												title={t('prezillo.owner')}
											/>
										)}
									</div>
									<div className="c-presenter-indicator__slide">
										{t('prezillo.slide')} {slideNum}/{totalViews}
									</div>
								</div>
								<button
									className={`c-button compact${isFollowing ? ' accent' : ' primary'}`}
									onClick={() => handleFollowClick(presenter.clientId)}
								>
									{isFollowing ? t('prezillo.following') : t('prezillo.follow')}
								</button>
							</div>
						</div>
					)}
				</div>
			)
		}

		// Desktop: inline display without dropdown
		return (
			<div className="c-presenter-indicator c-presenter-indicator--single">
				<div
					className="c-presenter-indicator__avatar"
					style={{ backgroundColor: presenter.user.color }}
				>
					{presenter.user.name.charAt(0).toUpperCase()}
				</div>
				<div className="c-presenter-indicator__info">
					<div className="c-presenter-indicator__name">
						{presenter.user.name}
						{presenter.isOwner && (
							<IcOwner
								className="c-presenter-indicator__owner-badge"
								title={t('prezillo.owner')}
							/>
						)}
					</div>
					<div className="c-presenter-indicator__slide">
						{t('prezillo.slide')} {slideNum}/{totalViews}
					</div>
				</div>
				<button
					className={`c-button compact${isFollowing ? ' accent' : ' primary'}`}
					onClick={() => handleFollowClick(presenter.clientId)}
				>
					{isFollowing ? t('prezillo.following') : t('prezillo.follow')}
				</button>
			</div>
		)
	}

	// Multiple presenters - show badge with dropdown
	return (
		<div ref={containerRef} className="c-presenter-indicator">
			<button
				className="c-presenter-indicator__badge"
				onClick={() => setIsOpen(!isOpen)}
				title={t('prezillo.presentersActive', { count: presenters.length })}
			>
				<span className="c-presenter-indicator__icon">
					<span className="c-presenter-indicator__pulse" />
				</span>
				<span className="c-presenter-indicator__count">
					{presenters.length} {t('prezillo.presenting')}
				</span>
				<IcCaret className={`c-presenter-indicator__caret${isOpen ? ' open' : ''}`} />
			</button>

			{isOpen && (
				<div className="c-presenter-indicator__dropdown">
					{presenters.map((presenter) => {
						const isFollowing = followingClientId === presenter.clientId
						const slideNum = presenter.viewIndex + 1

						return (
							<div
								key={presenter.clientId}
								className={`c-presenter-indicator__item${presenter.isOwner ? ' owner' : ''}`}
							>
								<div
									className="c-presenter-indicator__avatar"
									style={{ backgroundColor: presenter.user.color }}
								>
									{presenter.user.name.charAt(0).toUpperCase()}
								</div>
								<div className="c-presenter-indicator__info">
									<div className="c-presenter-indicator__name">
										{presenter.user.name}
										{presenter.isOwner && (
											<IcOwner
												className="c-presenter-indicator__owner-badge"
												title={t('prezillo.owner')}
											/>
										)}
									</div>
									<div className="c-presenter-indicator__slide">
										{t('prezillo.slide')} {slideNum}/{totalViews}
									</div>
								</div>
								<button
									className={`c-button compact${isFollowing ? ' accent' : ' primary'}`}
									onClick={() => handleFollowClick(presenter.clientId)}
								>
									{isFollowing ? t('prezillo.following') : t('prezillo.follow')}
								</button>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

// vim: ts=4
