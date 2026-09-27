// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `[▦]` overflow popup at the end of the context strip: find a community, pin or
 * unpin it, or drag it onto a chosen position in the strip.
 *
 * The body is `CommunityFinder`, shared with the mobile community sheet.
 */

import { Badge, BadgeAnchor, Button, Menu as PopupSurface, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { CommunityFinder } from './CommunityFinder.js'

export interface CommunityPopupProps {
	icon: React.ReactNode
	/** Pinned communities that did not fit on the strip. */
	overflowCount: number
	/** Any of those has unread content. */
	overflowUnread: boolean
	/** Trigger label (aria-label + title). Defaults to "All communities". */
	label?: string
	/** Rendered inside a `SortableGroup`: cards drag onto the context strip. */
	draggable?: boolean
}

export function CommunityPopup({
	icon,
	overflowCount,
	overflowUnread,
	label,
	draggable
}: CommunityPopupProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const buttonRef = React.useRef<HTMLButtonElement | null>(null)
	const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null)

	function open() {
		const rect = buttonRef.current?.getBoundingClientRect()
		setPosition({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 })
	}

	const close = React.useCallback(() => setPosition(null), [])

	if (!auth) return null

	const title = label ?? t('All communities')

	return (
		<>
			<Button
				ref={buttonRef}
				kind="nav-link"
				className="c-ctx-overflow"
				onClick={() => (position ? close() : open())}
				aria-label={
					overflowCount > 0
						? `${title}, ${t('{{count}} more communities', { count: overflowCount })}`
						: title
				}
				aria-expanded={!!position}
				aria-haspopup="dialog"
			>
				<BadgeAnchor
					badge={
						overflowCount > 0 && (
							<Badge size="sm" aria-hidden="true">
								{overflowCount}
							</Badge>
						)
					}
				>
					<BadgeAnchor
						position="bottom-end"
						badge={
							overflowUnread && (
								<Badge dot color="accent" aria-label={t('New content')} />
							)
						}
					>
						{icon}
					</BadgeAnchor>
				</BadgeAnchor>
			</Button>
			{position && (
				<PopupSurface
					position={position}
					onClose={close}
					role="dialog"
					aria-label={t('All communities')}
					className="c-community-popup"
				>
					<CommunityFinder variant="popup" onDone={close} draggable={draggable} />
				</PopupSurface>
			)}
		</>
	)
}

// vim: ts=4
