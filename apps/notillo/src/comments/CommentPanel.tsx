// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { UseCommentsReturn, CommentThread } from '@cloudillo/react'
import { ThreadList } from './ThreadList.js'

interface CommentPanelProps {
	comments: UseCommentsReturn
	threads: CommentThread[]
	pageId: string
	idTag: string
	readOnly: boolean
	pendingAnchor?: string
	pendingOffset?: number
	onPendingAnchorConsumed?: () => void
	focusBlockId?: string
	onFocusBlockConsumed?: () => void
}

export function CommentPanel({
	comments,
	threads,
	pageId,
	idTag,
	readOnly,
	pendingAnchor,
	pendingOffset,
	onPendingAnchorConsumed,
	focusBlockId,
	onFocusBlockConsumed
}: CommentPanelProps) {
	const { createThread } = comments

	async function handleCreateThread(text: string, anchor?: string) {
		await createThread(`p:${pageId}`, anchor || 'b:', text)
	}

	return (
		<ThreadList
			comments={comments}
			threads={threads}
			idTag={idTag}
			readOnly={readOnly}
			onCreateThread={handleCreateThread}
			pendingAnchor={pendingAnchor}
			pendingOffset={pendingOffset}
			onPendingAnchorConsumed={onPendingAnchorConsumed}
			focusBlockId={focusBlockId}
			onFocusBlockConsumed={onFocusBlockConsumed}
		/>
	)
}

// vim: ts=4
