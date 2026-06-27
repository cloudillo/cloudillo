// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuMessageSquare } from 'react-icons/lu'

interface CommentBadgeProps {
	count: number
	unread: boolean
}

export function CommentBadge({ count, unread }: CommentBadgeProps) {
	const countLabel = count > 99 ? '99+' : String(count)
	return (
		<span className="c-comment-badge" aria-hidden>
			<span className="c-comment-badge-icon">
				<LuMessageSquare size={28} />
				{count > 0 && <span className="c-comment-badge-count">{countLabel}</span>}
				{unread && <span className="c-badge dot accent c-comment-badge-unread" />}
			</span>
		</span>
	)
}
