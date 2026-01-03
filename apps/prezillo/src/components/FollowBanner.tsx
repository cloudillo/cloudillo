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
 * FollowBanner - Shows when following a presenter
 *
 * Features:
 * - Colored border matching presenter's color
 * - Slide counter synced with presenter
 * - Fullscreen button to match presenter's view
 * - Stop Following button
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiArrowsOutBold as IcFullscreen,
	PiXBold as IcClose,
	PiLinkBold as IcLink
} from 'react-icons/pi'

import type { PresenterInfo } from '../awareness'

export interface FollowBannerProps {
	presenter: PresenterInfo
	totalViews: number
	onStopFollowing: () => void
	onEnterFullscreen: () => void
	/** Mobile mode - icon-only buttons, truncated text */
	isMobile?: boolean
}

export function FollowBanner({
	presenter,
	totalViews,
	onStopFollowing,
	onEnterFullscreen,
	isMobile = false
}: FollowBannerProps) {
	const { t } = useTranslation()
	const slideNum = presenter.viewIndex + 1

	// Truncate name on mobile (max 12 chars)
	const displayName = isMobile
		? presenter.user.name.slice(0, 12) + (presenter.user.name.length > 12 ? '…' : '')
		: presenter.user.name

	return (
		<div
			className={`c-follow-banner${isMobile ? ' c-follow-banner--mobile' : ''}`}
			style={{ '--presenter-color': presenter.user.color } as React.CSSProperties}
		>
			<div className="c-follow-banner__content">
				<IcLink className="c-follow-banner__icon" />
				<span className="c-follow-banner__text">
					{isMobile ? displayName : t('prezillo.followingUser', { name: displayName })}
				</span>
				<span className="c-follow-banner__separator" />
				<span className="c-follow-banner__slide">
					{isMobile
						? `${slideNum}/${totalViews}`
						: `${t('prezillo.slide')} ${slideNum}/${totalViews}`}
				</span>
			</div>

			<div className="c-follow-banner__actions">
				<button
					className="c-follow-banner__btn c-follow-banner__btn--fullscreen"
					onClick={onEnterFullscreen}
					title={t('prezillo.enterFullscreen')}
				>
					<IcFullscreen />
					{!isMobile && <span>{t('prezillo.fullscreen')}</span>}
				</button>
				<button
					className="c-follow-banner__btn c-follow-banner__btn--stop"
					onClick={onStopFollowing}
					title={t('prezillo.stopFollowing')}
				>
					<IcClose />
					{!isMobile && <span>{t('prezillo.stopFollowing')}</span>}
				</button>
			</div>
		</div>
	)
}

// vim: ts=4
