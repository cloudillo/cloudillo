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
