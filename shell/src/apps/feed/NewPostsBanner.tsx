// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronUp as IcUp } from 'react-icons/lu'

import { Button, mergeClasses } from '@cloudillo/react'

export interface NewPostsBannerProps {
	count: number
	onClick: () => void
	className?: string
}

export function NewPostsBanner({ count, onClick, className }: NewPostsBannerProps) {
	const { t } = useTranslation()

	if (count === 0) return null

	return (
		<div
			className={mergeClasses(
				'c-new-posts-banner',
				'd-flex justify-content-center',
				className
			)}
		>
			<Button
				variant="primary"
				size="small"
				onClick={onClick}
				icon={<IcUp />}
				className="c-new-posts-banner-button"
			>
				{t('{{count}} new posts', { count })}
			</Button>
		</div>
	)
}

// vim: ts=4
