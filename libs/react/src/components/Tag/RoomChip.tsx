// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { parseChannel } from '../../channel.js'
import { mergeClasses } from '../utils.js'
import { Tag } from './Tag.js'

export interface RoomChipProps {
	className?: string
	/** A bare room name, or `@tenant~name`. */
	channel: string
	/** The idTag the item lives on (its audience, else its issuer); a room there
	 *  shows as `~name`, any other as the full `@tenant~name`. */
	contextTag?: string
	/** Room title — tooltip and accessible name only, never the chip text. */
	title?: string
	onClick?: React.MouseEventHandler<HTMLElement>
	/** Shows a × that calls this; takes precedence over `onClick`. */
	onRemove?: () => void
}

/** The room an item was posted in, as a `~name` text chip. */
export function RoomChip({
	className,
	channel,
	contextTag,
	title,
	onClick,
	onRemove
}: RoomChipProps) {
	const { tenant, name } = parseChannel(channel)
	const text = !tenant || tenant === contextTag ? `~${name}` : `@${tenant}~${name}`
	const label = title ? `${title} (${text})` : undefined

	return (
		<Tag
			className={mergeClasses('c-room-chip', className)}
			size="sm"
			title={label}
			aria-label={label}
			{...(onRemove ? { onRemove } : { onClick })}
		>
			{text}
		</Tag>
	)
}

// vim: ts=4
