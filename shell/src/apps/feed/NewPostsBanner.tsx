// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Affix, Button, Center } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronUp as IcUp } from 'react-icons/lu'

export interface NewPostsBannerProps {
	count: number
	onClick: () => void
	className?: string
}

// Sticky pill above the feed; the count is announced politely.
export function NewPostsBanner({ count, onClick, className }: NewPostsBannerProps) {
	const { t } = useTranslation()

	if (count === 0) return null

	return (
		<Affix mode="sticky" position="top" className={className}>
			<Center>
				<Button
					color="primary"
					shape="pill"
					size="sm"
					onClick={onClick}
					icon={<IcUp />}
					aria-live="polite"
				>
					{t('{{count}} new posts', { count })}
				</Button>
			</Center>
		</Affix>
	)
}

// vim: ts=4
