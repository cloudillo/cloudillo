// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuMessageSquare } from 'react-icons/lu'

interface CommentBadgeProps {
	total: number
	unread: number
}

export function CommentBadge({ total, unread }: CommentBadgeProps) {
	const totalLabel = total > 99 ? '99+' : String(total)
	const unreadLabel = unread > 9 ? '9+' : String(unread)
	return (
		<span className="c-comment-badge" aria-hidden>
			<LuMessageSquare size={28} />
			{total > 0 && <span className="c-comment-badge-count">{totalLabel}</span>}
			{unread > 0 && <span className="c-comment-badge-unread">{unreadLabel}</span>}
		</span>
	)
}
