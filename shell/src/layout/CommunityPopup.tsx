// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `[▦]` overflow popup at the end of the context strip: find a community, pin or
 * unpin it, or drag it onto a chosen position in the strip.
 *
 * The body is `CommunityFinder`, shared with the mobile community sheet.
 */

import { Button, Menu as PopupSurface, useAuth } from '@cloudillo/react'
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
	/** Omit both to render non-draggable cards. */
	onDragStartRow?: (idTag: string) => void
	onDragEndRow?: () => void
}

export function CommunityPopup({
	icon,
	overflowCount,
	overflowUnread,
	label,
	onDragStartRow,
	onDragEndRow
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

	return (
		<>
			<Button
				ref={buttonRef}
				kind="nav-link"
				className="c-ctx-overflow"
				onClick={() => (position ? close() : open())}
				aria-label={label ?? t('All communities')}
				title={label ?? t('All communities')}
				aria-expanded={!!position}
				aria-haspopup="dialog"
			>
				{icon}
				{overflowCount > 0 && (
					<span className="c-badge positioned tr" aria-hidden="true">
						{overflowCount}
					</span>
				)}
				{overflowUnread && (
					<span
						className="c-badge dot accent positioned br"
						role="status"
						aria-label={t('New content')}
					/>
				)}
				{overflowCount > 0 && (
					<span className="sr-only">
						{t('{{count}} more communities', { count: overflowCount })}
					</span>
				)}
			</Button>
			{position && (
				<PopupSurface
					position={position}
					onClose={close}
					role="dialog"
					aria-label={t('All communities')}
					className="c-community-popup"
				>
					<CommunityFinder
						variant="popup"
						onDone={close}
						onDragStartRow={onDragStartRow}
						onDragEndRow={onDragEndRow}
					/>
				</PopupSurface>
			)}
		</>
	)
}

// vim: ts=4
