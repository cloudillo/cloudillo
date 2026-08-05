// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { mergeClasses } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuCloudOff as IcOffline } from 'react-icons/lu'

export interface OfflineBannerProps {
	/** Render nothing when false — lets call sites pass the flag straight through */
	show: boolean
	className?: string
}

/** Marks a list as served from the local cache, so stale content isn't mistaken for live. */
export function OfflineBanner({ show, className }: OfflineBannerProps) {
	const { t } = useTranslation()

	if (!show) return null

	return (
		<div
			className={mergeClasses(
				'c-hbox g-2 align-items-center p-2 bg-container-secondary rounded',
				className
			)}
		>
			<IcOffline />
			<span className="flex-fill text-small text-muted">
				{t('Showing cached data — you appear to be offline')}
			</span>
		</div>
	)
}

// vim: ts=4
