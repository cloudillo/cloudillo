// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

import { Button, Modal } from '@cloudillo/react'
import type { AddressBookOutput } from '@cloudillo/core'

export interface AddressBookEditorProps {
	open: boolean
	book?: AddressBookOutput
	onClose: () => void
	onSave: (data: { name: string; description?: string }) => Promise<void>
}

export function AddressBookEditor({ open, book, onClose, onSave }: AddressBookEditorProps) {
	const { t } = useTranslation()
	const [name, setName] = React.useState('')
	const [description, setDescription] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open) {
			setName(book?.name ?? '')
			setDescription(book?.description ?? '')
			setError(undefined)
		}
	}, [open, book])

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault()
		const trimmed = name.trim()
		if (!trimmed) {
			setError(t('Name is required'))
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			await onSave({ name: trimmed, description: description.trim() || undefined })
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to save address book'))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose}>
			<form
				className="c-dialog c-panel emph p-4"
				style={{ maxWidth: '480px', width: '100%' }}
				onSubmit={handleSave}
			>
				<div className="d-flex align-items-center justify-content-between mb-3">
					<h3 className="m-0">
						{book ? t('Rename address book') : t('New address book')}
					</h3>
					<button
						type="button"
						className="c-link"
						onClick={onClose}
						aria-label={t('Close')}
					>
						<IcClose />
					</button>
				</div>

				{error && (
					<div
						className="c-panel bg-container-error p-2 mb-3"
						role="alert"
						aria-live="polite"
					>
						<span className="text-error">{error}</span>
					</div>
				)}

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Name')}</label>
					<input
						className="c-input"
						placeholder={t('e.g., Personal')}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
					/>
				</div>

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Description (optional)')}</label>
					<input
						className="c-input"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>

				<div className="d-flex justify-content-end g-2">
					<Button type="button" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button type="submit" primary disabled={submitting}>
						{submitting ? t('Saving...') : book ? t('Save') : t('Create')}
					</Button>
				</div>
			</form>
		</Modal>
	)
}

// vim: ts=4
