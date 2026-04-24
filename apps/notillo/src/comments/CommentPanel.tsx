// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { UseCommentsReturn, CommentThread } from '@cloudillo/react'
import { ThreadList, type ThreadListHandle } from './ThreadList.js'

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
	hideHeader?: boolean
}

export const CommentPanel = React.forwardRef<ThreadListHandle, CommentPanelProps>(
	function CommentPanel(
		{
			comments,
			threads,
			pageId,
			idTag,
			readOnly,
			pendingAnchor,
			pendingOffset,
			onPendingAnchorConsumed,
			focusBlockId,
			onFocusBlockConsumed,
			hideHeader
		},
		ref
	) {
		const { createThread } = comments

		async function handleCreateThread(text: string, anchor?: string) {
			await createThread(`p:${pageId}`, anchor || 'b:', text)
		}

		return (
			<ThreadList
				ref={ref}
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
				hideHeader={hideHeader}
			/>
		)
	}
)

// vim: ts=4
