// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcPlus,
	LuSend as IcSend,
	LuCircleCheck as IcResolved,
	LuMessageCircle as IcReply,
	LuCircle as IcReopen,
	LuChevronsUpDown as IcCollapse
} from 'react-icons/lu'

import { Button } from '@cloudillo/react'
import type { UseCommentsReturn, CommentThread, Comment } from '@cloudillo/react'
import { CommentItem } from './CommentItem.js'
import { anchorBlockId, shortTimeFormat } from './utils.js'

interface ThreadListProps {
	comments: UseCommentsReturn
	threads: CommentThread[]
	idTag: string
	readOnly: boolean
	onCreateThread: (text: string, anchor?: string) => Promise<void>
	pendingAnchor?: string
	pendingOffset?: number
	onPendingAnchorConsumed?: () => void
	focusBlockId?: string
	onFocusBlockConsumed?: () => void
	/** Skip rendering the built-in `.comment-panel-header`. Use when the
	 * parent provides the header externally (e.g. via `FcdDetails`'s
	 * `header` slot) and needs to trigger new-comment via the imperative
	 * handle. */
	hideHeader?: boolean
}

export interface ThreadListHandle {
	openNewComment: () => void
}

export interface ThreadListHeaderProps {
	readOnly: boolean
	onNewComment?: () => void
}

/** Header row (title + "+"-button) of the comments panel. Rendered
 * internally by `ThreadList` by default; or externally by callers who pass
 * `hideHeader` to `ThreadList` and wire the "+" button to
 * `ThreadListHandle.openNewComment()`. */
export function ThreadListHeader({ readOnly, onNewComment }: ThreadListHeaderProps) {
	const { t } = useTranslation()
	return (
		<>
			<span className="font-semibold flex-fill">{t('Comments')}</span>
			{!readOnly && onNewComment && (
				<Button
					kind="link"
					mode="icon"
					size="small"
					onClick={onNewComment}
					title={t('New comment')}
				>
					<IcPlus />
				</Button>
			)}
		</>
	)
}

/** Compute a block element's Y offset relative to the content scroll area top */
function getBlockOffset(blockId: string): number | null {
	const scrollArea = document.querySelector('.c-fcd-content-scroll')
	const blockEl = document.querySelector(`[data-id="${blockId}"]`)
	if (!scrollArea || !blockEl) return null
	const scrollRect = scrollArea.getBoundingClientRect()
	const blockRect = blockEl.getBoundingClientRect()
	return blockRect.top - scrollRect.top + scrollArea.scrollTop
}

interface PositionedItem {
	type: 'thread' | 'form'
	id: string
	desiredOffset: number
	thread?: CommentThread
}

// ── Inline expanded thread ──

function ExpandedThread({
	comments,
	thread,
	idTag,
	readOnly,
	onCollapse,
	onToggleStatus
}: {
	comments: UseCommentsReturn
	thread: CommentThread
	idTag: string
	readOnly: boolean
	onCollapse: () => void
	onToggleStatus: () => void
}) {
	const { t } = useTranslation()
	const [commentList, setCommentList] = React.useState<Comment[]>([])
	const [replyText, setReplyText] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const { subscribeComments, addComment, editComment, deleteComment } = comments

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
		} else if (e.key === 'Escape') {
			onCollapse()
		}
	}

	return (
		<div
			className="comment-thread-expanded"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<div className="comment-thread-collapse">
				<Button
					kind="link"
					mode="icon"
					size="small"
					onClick={onCollapse}
					title={t('Collapse')}
				>
					<IcCollapse size={14} />
				</Button>
			</div>
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
					<Button kind="link" size="small" onClick={onToggleStatus}>
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

// ── Thread list ──

export const ThreadList = React.forwardRef<ThreadListHandle, ThreadListProps>(function ThreadList(
	{
		comments,
		threads,
		idTag,
		readOnly,
		onCreateThread,
		pendingAnchor,
		pendingOffset,
		onPendingAnchorConsumed,
		focusBlockId,
		onFocusBlockConsumed,
		hideHeader
	},
	ref
) {
	const { t } = useTranslation()
	const [expandedId, setExpandedId] = React.useState<string | null>(null)
	const [showForm, setShowForm] = React.useState(false)
	const [text, setText] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const [anchor, setAnchor] = React.useState<string | undefined>()
	const [formOffset, setFormOffset] = React.useState<number | undefined>()
	const textareaRef = React.useRef<HTMLTextAreaElement>(null)
	const formRef = React.useRef<HTMLDivElement>(null)

	// Recompute block offsets when threads change or editor reflows.
	// Uses ResizeObserver on the content scroll area to detect layout changes
	// (e.g., when the details panel opens/closes and the editor reflows).
	const [blockOffsets, setBlockOffsets] = React.useState<Map<string, number>>(new Map())
	const threadsRef = React.useRef(threads)
	threadsRef.current = threads

	const recalcOffsets = React.useCallback(() => {
		const offsets = new Map<string, number>()
		for (const thread of threadsRef.current) {
			const blockId = anchorBlockId(thread.anchor)
			if (blockId) {
				const offset = getBlockOffset(blockId)
				if (offset != null) offsets.set(thread.id, offset)
			}
		}
		setBlockOffsets(offsets)
	}, [])

	React.useEffect(() => {
		// Initial calculation (slightly delayed for first render)
		const timer = setTimeout(recalcOffsets, 80)

		// Observe the content scroll area for size changes (editor reflow)
		const scrollArea = document.querySelector('.c-fcd-content-scroll')
		let observer: ResizeObserver | undefined
		if (scrollArea) {
			observer = new ResizeObserver(() => {
				recalcOffsets()
			})
			observer.observe(scrollArea)
		}

		return () => {
			clearTimeout(timer)
			observer?.disconnect()
		}
	}, [recalcOffsets])

	// Also recalculate when threads change
	React.useEffect(() => {
		recalcOffsets()
	}, [threads, recalcOffsets])

	// Auto-open form when pendingAnchor arrives
	React.useEffect(() => {
		if (pendingAnchor) {
			setAnchor(pendingAnchor)
			setFormOffset(pendingOffset)
			setShowForm(true)
			onPendingAnchorConsumed?.()
		}
	}, [pendingAnchor, pendingOffset, onPendingAnchorConsumed])

	// Focus a thread by its block anchor (e.g., after opening the side panel from a badge click).
	// Delayed to let the layout settle after the panel opens and the editor reflows.
	const [scrollToThreadId, setScrollToThreadId] = React.useState<string | null>(null)

	React.useEffect(() => {
		if (!focusBlockId) return
		const anchor = `b:${focusBlockId}`
		const timer = setTimeout(() => {
			const thread = threads.find((t) => t.anchor === anchor && t.status === 'open')
			if (thread) {
				setExpandedId(thread.id)
				setScrollToThreadId(thread.id)
			}
			onFocusBlockConsumed?.()
		}, 300)
		return () => clearTimeout(timer)
	}, [focusBlockId, threads, onFocusBlockConsumed])

	// Scroll to the focused thread after it renders
	React.useEffect(() => {
		if (!scrollToThreadId) return
		const timer = setTimeout(() => {
			const el = document.querySelector(`[data-thread-id="${CSS.escape(scrollToThreadId)}"]`)
			el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
			setScrollToThreadId(null)
		}, 50)
		return () => clearTimeout(timer)
	}, [scrollToThreadId])

	React.useEffect(() => {
		if (showForm && textareaRef.current) {
			textareaRef.current.focus()
		}
		if (showForm && formRef.current) {
			formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
		}
	}, [showForm])

	async function handleSubmit() {
		const trimmed = text.trim()
		if (!trimmed || submitting) return
		setSubmitting(true)
		try {
			await onCreateThread(trimmed, anchor)
			setText('')
			setAnchor(undefined)
			setFormOffset(undefined)
			setShowForm(false)
		} finally {
			setSubmitting(false)
		}
	}

	function handleCancel() {
		setShowForm(false)
		setText('')
		setAnchor(undefined)
		setFormOffset(undefined)
	}

	function handleNewComment() {
		setFormOffset(undefined)
		setAnchor(undefined)
		setShowForm(true)
	}

	React.useImperativeHandle(ref, () => ({ openNewComment: handleNewComment }), [handleNewComment])

	function handleFormKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			void handleSubmit()
		} else if (e.key === 'Escape') {
			handleCancel()
		}
	}

	// Build positioned items
	const { positioned, unpositioned } = React.useMemo(() => {
		const positioned: PositionedItem[] = []
		const unpositioned: CommentThread[] = []

		for (const thread of threads) {
			const offset = blockOffsets.get(thread.id)
			if (offset != null) {
				positioned.push({ type: 'thread', id: thread.id, desiredOffset: offset, thread })
			} else {
				unpositioned.push(thread)
			}
		}

		if (showForm && formOffset != null) {
			positioned.push({ type: 'form', id: '__form__', desiredOffset: formOffset })
		}

		positioned.sort((a, b) => a.desiredOffset - b.desiredOffset)
		return { positioned, unpositioned }
	}, [threads, blockOffsets, showForm, formOffset])

	const hasPositioned = positioned.length > 0
	const formInHeader = showForm && formOffset == null

	function handleToggleStatus(thread: CommentThread) {
		const newStatus = thread.status === 'open' ? 'resolved' : 'open'
		comments.setThreadStatus(thread.id, newStatus).catch(console.error)
		if (newStatus === 'resolved') {
			setExpandedId(null)
		}
	}

	// Highlight exactly ONE block at a time in the editor.
	// ProseMirror reconstructs DOM nodes, so we inject a <style> tag
	// with attribute selectors that survive re-renders.
	//
	// Priority: hover > expanded. When hovering a different thread,
	// the hover highlight replaces the expanded one. On mouse leave,
	// the expanded thread's highlight returns.
	const highlightRef = React.useRef<HTMLStyleElement | null>(null)
	const expandedBlockIdRef = React.useRef<string | null>(null)

	function setHighlight(blockId: string | null) {
		if (highlightRef.current) {
			highlightRef.current.remove()
			highlightRef.current = null
		}
		if (!blockId) return
		const eid = CSS.escape(blockId)
		const style = document.createElement('style')
		style.dataset.commentHighlight = blockId
		style.textContent = [
			`[data-id="${eid}"].bn-block-outer { background-color: color-mix(in srgb, var(--col-primary) 12%, transparent) !important; border-left: 3px solid var(--col-primary) !important; border-radius: var(--radius-sm) !important; }`,
			`[data-id="${eid}"].bn-block { background-color: color-mix(in srgb, var(--col-primary) 12%, transparent) !important; border-left: 3px solid var(--col-primary) !important; border-radius: var(--radius-sm) !important; }`
		].join('\n')
		document.head.appendChild(style)
		highlightRef.current = style
	}

	function handleThreadHover(thread: CommentThread, on: boolean) {
		if (on) {
			setHighlight(anchorBlockId(thread.anchor))
		} else {
			// Restore expanded thread's highlight (or clear)
			setHighlight(expandedBlockIdRef.current)
		}
	}

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			highlightRef.current?.remove()
		}
	}, [])

	// Track expanded thread's block and apply highlight
	React.useEffect(() => {
		const thread = expandedId ? threads.find((t) => t.id === expandedId) : null
		const blockId = thread ? anchorBlockId(thread.anchor) : null
		expandedBlockIdRef.current = blockId
		setHighlight(blockId)
		return () => {
			expandedBlockIdRef.current = null
			setHighlight(null)
		}
	}, [expandedId, threads])

	function renderThread(thread: CommentThread) {
		const isExpanded = expandedId === thread.id
		return (
			<div
				key={thread.id}
				data-thread-id={thread.id}
				className={`comment-thread-item${thread.status === 'resolved' ? ' resolved' : ''}${isExpanded ? ' expanded' : ''}`}
				role="button"
				tabIndex={0}
				onClick={() => setExpandedId(isExpanded ? null : thread.id)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						setExpandedId(isExpanded ? null : thread.id)
					}
				}}
				onMouseEnter={() => handleThreadHover(thread, true)}
				onMouseLeave={() => handleThreadHover(thread, false)}
			>
				{!isExpanded && (
					<>
						<div className="comment-item-header">
							<span className="comment-item-author" title={thread.createdBy}>
								{thread.createdByName || `@${thread.createdBy}`}
							</span>
							<span className="comment-time">
								{shortTimeFormat(thread.createdAt)}
							</span>
							{thread.status === 'resolved' && (
								<IcResolved size={12} className="comment-resolved-icon" />
							)}
						</div>
						{thread.textPreview && (
							<p className="comment-thread-preview">{thread.textPreview}</p>
						)}
						{thread.commentCount > 1 && (
							<div className="comment-thread-replies">
								<IcReply size={12} />
								<span>
									{t('{{count}} replies', { count: thread.commentCount - 1 })}
								</span>
							</div>
						)}
					</>
				)}
				{isExpanded && (
					<ExpandedThread
						comments={comments}
						thread={thread}
						idTag={idTag}
						readOnly={readOnly}
						onCollapse={() => setExpandedId(null)}
						onToggleStatus={() => handleToggleStatus(thread)}
					/>
				)}
			</div>
		)
	}

	function renderForm() {
		return (
			<div ref={formRef} className="comment-new-form">
				<textarea
					ref={textareaRef}
					className="comment-input"
					placeholder={t('Write a comment...')}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleFormKeyDown}
					rows={3}
				/>
				<div className="comment-input-actions">
					<Button
						size="small"
						onClick={handleSubmit}
						disabled={!text.trim() || submitting}
					>
						<IcSend size={14} /> {t('Send')}
					</Button>
					<Button kind="link" size="small" onClick={handleCancel}>
						{t('Cancel')}
					</Button>
				</div>
			</div>
		)
	}

	// Absolute positioning aligned to editor blocks.
	// Items are placed at their desired offset unless a previous item
	// would overlap, in which case they're pushed down.
	const GAP = 8
	const itemElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
	const [itemHeights, setItemHeights] = React.useState<Map<string, number>>(new Map())

	const itemRef = React.useCallback(
		(id: string) => (el: HTMLDivElement | null) => {
			if (el) itemElsRef.current.set(id, el)
			else itemElsRef.current.delete(id)
		},
		[]
	)

	// Measure heights after DOM commit. setState in useLayoutEffect
	// triggers a synchronous re-render before the browser paints,
	// so stale positions are never visible.
	React.useLayoutEffect(() => {
		const next = new Map<string, number>()
		let changed = false
		for (const [id, el] of itemElsRef.current) {
			const h = el.getBoundingClientRect().height
			next.set(id, h)
			if (itemHeights.get(id) !== h) changed = true
		}
		if (changed) setItemHeights(next)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [positioned, expandedId])

	function computeLayout() {
		const layout: { item: PositionedItem; top: number }[] = []
		let minTop = 0

		for (const item of positioned) {
			const top = Math.max(item.desiredOffset, minTop)
			layout.push({ item, top })
			const height = itemHeights.get(item.id) ?? (item.type === 'form' ? 120 : 60)
			minTop = top + height + GAP
		}

		const last = layout[layout.length - 1]
		const containerHeight = last ? last.top + (itemHeights.get(last.item.id) ?? 60) : 0

		return { layout, containerHeight }
	}

	function renderPositioned() {
		const { layout, containerHeight } = computeLayout()

		return (
			<div style={{ position: 'relative', minHeight: containerHeight }}>
				{layout.map(({ item, top }) => {
					const isExpanded = item.thread && expandedId === item.thread.id
					return (
						<div
							key={item.id}
							ref={itemRef(item.id)}
							style={{
								position: 'absolute',
								top,
								left: 0,
								right: 0,
								zIndex: isExpanded ? 10 : 1
							}}
						>
							{item.type === 'form'
								? renderForm()
								: item.thread && renderThread(item.thread)}
						</div>
					)
				})}
			</div>
		)
	}

	return (
		<div className="c-vbox fill">
			{!hideHeader && (
				<div className="comment-panel-header">
					<ThreadListHeader readOnly={readOnly} onNewComment={handleNewComment} />
				</div>
			)}

			{formInHeader && renderForm()}

			<div className="fill overflow-y-auto">
				{unpositioned.map(renderThread)}
				{hasPositioned && renderPositioned()}
				{threads.length === 0 && !showForm && (
					<div className="c-vbox align-items-center justify-content-center p-4 opacity-50">
						<p>{t('No comments yet.')}</p>
					</div>
				)}
			</div>
		</div>
	)
})

// vim: ts=4
