// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Panel } from '../Panel/index.js'
import type { ColorVariant } from '../types.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface ChatBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
	/** `end` = own message (right in LTR), `start` = someone else's */
	side: 'start' | 'end'
	/** Defaults to `primary` on `end`, `secondary` on `start` */
	color?: ColorVariant
}

/** A chat message bubble. Ref and rest props land on the outer, aligned element. */
export const ChatBubble = createComponent<HTMLDivElement, ChatBubbleProps>(
	'ChatBubble',
	({ side, color, className, children, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-chat-bubble', side, className)} {...props}>
			<Panel
				color={color ?? (side === 'end' ? 'primary' : 'secondary')}
				padding={2}
				className="px-3"
			>
				{children}
			</Panel>
		</div>
	)
)

// vim: ts=4
