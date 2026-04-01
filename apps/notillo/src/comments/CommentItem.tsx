// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPencil as IcEdit, LuTrash2 as IcDelete, LuCheck as IcCheck } from 'react-icons/lu'

import { Button } from '@cloudillo/react'
import type { Comment } from '@cloudillo/react'
import { shortTimeFormat } from './utils.js'

interface CommentItemProps {
	comment: Comment
	isOwn: boolean
	readOnly: boolean
	onEdit: (id: string, text: string) => void
	onDelete: (id: string) => void
}

export function CommentItem({ comment, isOwn, readOnly, onEdit, onDelete }: CommentItemProps) {
	const { t } = useTranslation()
	const [editing, setEditing] = React.useState(false)
	const [confirmDelete, setConfirmDelete] = React.useState(false)
	const [editText, setEditText] = React.useState(comment.text)
	const textareaRef = React.useRef<HTMLTextAreaElement>(null)

	React.useEffect(() => {
		if (editing && textareaRef.current) {
			textareaRef.current.focus()
			textareaRef.current.selectionStart = textareaRef.current.value.length
		}
	}, [editing])

	function handleSave() {
		const trimmed = editText.trim()
		if (trimmed && trimmed !== comment.text) {
			onEdit(comment.id, trimmed)
		}
		setEditing(false)
	}

	function handleCancel() {
		setEditText(comment.text)
		setEditing(false)
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			handleSave()
		} else if (e.key === 'Escape') {
			handleCancel()
		}
	}

	const authorDisplay = comment.createdByName || `@${comment.createdBy}`
	const timeDisplay = shortTimeFormat(comment.createdAt)

	if (comment.deleted) {
		return (
			<div className="comment-item deleted">
				<div className="comment-item-header">
					<span className="comment-item-author" title={comment.createdBy}>
						{authorDisplay}
					</span>
					<span className="comment-time">{timeDisplay}</span>
				</div>
				<p className="comment-item-text">{t('[deleted]')}</p>
			</div>
		)
	}

	return (
		<div className="comment-item">
			<div className="comment-item-header">
				<span className="comment-item-author" title={comment.createdBy}>
					{authorDisplay}
				</span>
				{comment.edited && <span className="comment-item-edited">({t('edited')})</span>}
				<span className="comment-time">{timeDisplay}</span>
				{isOwn && !readOnly && !editing && (
					<span className="comment-item-actions">
						<button
							className="comment-action-btn"
							onClick={() => {
								setEditText(comment.text)
								setEditing(true)
							}}
							title={t('Edit')}
						>
							<IcEdit size={12} />
						</button>
						{confirmDelete ? (
							<button
								className="comment-action-btn comment-action-delete"
								onClick={() => {
									onDelete(comment.id)
									setConfirmDelete(false)
								}}
								onBlur={() => setConfirmDelete(false)}
								title={t('Confirm delete')}
								autoFocus
							>
								<IcDelete size={12} /> {t('Confirm?')}
							</button>
						) : (
							<button
								className="comment-action-btn comment-action-delete"
								onClick={() => setConfirmDelete(true)}
								title={t('Delete')}
							>
								<IcDelete size={12} />
							</button>
						)}
					</span>
				)}
			</div>
			{editing ? (
				<div className="comment-edit-form">
					<textarea
						ref={textareaRef}
						className="comment-input"
						value={editText}
						onChange={(e) => setEditText(e.target.value)}
						onKeyDown={handleKeyDown}
						rows={3}
					/>
					<div className="comment-input-actions">
						<Button size="small" onClick={handleSave}>
							<IcCheck size={14} /> {t('Save')}
						</Button>
						<Button link size="small" onClick={handleCancel}>
							{t('Cancel')}
						</Button>
					</div>
				</div>
			) : (
				<p className="comment-item-text">{comment.text}</p>
			)}
		</div>
	)
}

// vim: ts=4
