// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Badge, BadgeAnchor, HBox, Icon, Text } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMessageSquare } from 'react-icons/lu'

interface CommentBadgeProps {
	count: number
	unread: boolean
}

export function CommentBadge({ count, unread }: CommentBadgeProps) {
	const { t } = useTranslation()
	const countLabel = count > 99 ? '99+' : String(count)
	return (
		<HBox align="center" gap={1} aria-hidden>
			<BadgeAnchor
				badge={unread ? <Badge dot color="accent" aria-label={t('Unread')} /> : undefined}
			>
				<Icon as={LuMessageSquare} size="lg" />
			</BadgeAnchor>
			{count > 0 && <Text size="sm">{countLabel}</Text>}
		</HBox>
	)
}
