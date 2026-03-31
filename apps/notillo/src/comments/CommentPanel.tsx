// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
