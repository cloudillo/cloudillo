// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcClose,
	LuSend as IcSend,
	LuCircleCheck as IcResolved,
	LuCircle as IcReopen
} from 'react-icons/lu'

import { Button } from '@cloudillo/react'
import type { UseCommentsReturn, CommentThread, Comment } from '@cloudillo/react'
import { CommentItem } from './CommentItem.js'

interface CommentPopupProps {
	comments: UseCommentsReturn
	threads: CommentThread[]
	blockId: string
	idTag: string
	readOnly: boolean
	onClose: () => void
}

export function CommentPopup({
	comments,
	threads,
	blockId,
	idTag,
	readOnly,
	onClose
}: CommentPopupProps) {
	const { t } = useTranslation()
	const popupRef = React.useRef<HTMLDivElement>(null)
	const [isMobile, setIsMobile] = React.useState(
		() => window.matchMedia('(max-width: 767px)').matches
	)
	const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null)

	React.useEffect(() => {
		const mql = window.matchMedia('(max-width: 767px)')
		const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
		mql.addEventListener('change', handler)
		return () => mql.removeEventListener('change', handler)
	}, [])

	// Desktop: position the popup near the block
	React.useLayoutEffect(() => {
		if (isMobile) return
		const blockEl = document.querySelector(`.bn-block-outer[data-id="${CSS.escape(blockId)}"]`)
		if (!blockEl) return

		const blockRect = blockEl.getBoundingClientRect()
		const viewportH = window.innerHeight

		let top = blockRect.bottom + 4
		if (top + 300 > viewportH && blockRect.top > 300) {
			top = blockRect.top - 304
		}

		const left = Math.max(8, Math.min(blockRect.left, window.innerWidth - 368))
		setPosition({ top, left })
	}, [blockId, isMobile])

	// Desktop: close on outside click (only after position is calculated)
	React.useEffect(() => {
		if (isMobile || !position) return
		function handleClick(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
				onClose()
			}
		}
		document.addEventListener('mousedown', handleClick)
		return () => document.removeEventListener('mousedown', handleClick)
	}, [onClose, isMobile, position])

	// Close on Escape (both mobile and desktop)
	React.useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', handleKey)
		return () => document.removeEventListener('keydown', handleKey)
	}, [onClose])

	if (!isMobile && !position) return null
	if (threads.length === 0) return null

	return (
		<>
			{isMobile && <div className="comment-popup-backdrop" onClick={onClose} />}
			<div
				ref={popupRef}
				className="comment-popup"
				style={isMobile ? undefined : { top: position!.top, left: position!.left }}
			>
				<div className="comment-popup-header">
					<span className="font-semibold flex-fill" style={{ fontSize: '0.85rem' }}>
						{t('Comments')}
					</span>
					<Button link mode="icon" size="small" onClick={onClose}>
						<IcClose size={16} />
					</Button>
				</div>
				{threads.map((thread) => (
					<PopupThread
						key={thread.id}
						comments={comments}
						thread={thread}
						idTag={idTag}
						readOnly={readOnly}
					/>
				))}
			</div>
		</>
	)
}

function PopupThread({
	comments,
	thread,
	idTag,
	readOnly
}: {
	comments: UseCommentsReturn
	thread: CommentThread
	idTag: string
	readOnly: boolean
}) {
	const { t } = useTranslation()
	const [commentList, setCommentList] = React.useState<Comment[]>([])
	const [replyText, setReplyText] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const { subscribeComments, addComment, editComment, deleteComment, setThreadStatus } = comments

	React.useEffect(() => {
		const unsubscribe = subscribeComments(thread.id, setCommentList)
		return unsubscribe
	}, [subscribeComments, thread.id])

	async function handleReply() {
		const trimmed = replyText.trim()
		if (!trimmed || submitting) return
		setSubmitting(true)
		try {
			await addComment(thread.id, trimmed)
			setReplyText('')
		} finally {
			setSubmitting(false)
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			void handleReply()
		}
	}

	function handleToggleStatus() {
		const newStatus = thread.status === 'open' ? 'resolved' : 'open'
		setThreadStatus(thread.id, newStatus).catch(console.error)
	}

	return (
		<div className="comment-popup-thread">
			{commentList.map((comment) => (
				<CommentItem
					key={comment.id}
					comment={comment}
					isOwn={comment.createdBy === idTag}
					readOnly={readOnly}
					onEdit={(id, text) => editComment(id, text)}
					onDelete={(id) => deleteComment(id, thread.id)}
				/>
			))}
			{!readOnly && (
				<div className="comment-inline-reply">
					<textarea
						className="comment-input"
						placeholder={t('Reply...')}
						value={replyText}
						onChange={(e) => setReplyText(e.target.value)}
						onKeyDown={handleKeyDown}
						rows={1}
					/>
					<Button
						mode="icon"
						size="small"
						onClick={handleReply}
						disabled={!replyText.trim() || submitting}
						title={t('Send')}
					>
						<IcSend size={14} />
					</Button>
				</div>
			)}
			{!readOnly && (
				<div className="comment-thread-status">
					<Button link size="small" onClick={handleToggleStatus}>
						{thread.status === 'open' ? (
							<>
								<IcResolved size={12} /> {t('Resolve')}
							</>
						) : (
							<>
								<IcReopen size={12} /> {t('Reopen')}
							</>
						)}
					</Button>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
