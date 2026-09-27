// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AddressBookOutput } from '@cloudillo/core'
import { ActionBar, Alert, Button, Dialog, Field, Input, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

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
		<Dialog
			open={open}
			onClose={onClose}
			title={book ? t('Rename address book') : t('New address book')}
			onSubmit={handleSave}
			footer={
				<ActionBar>
					<Button type="button" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button type="submit" color="primary" loading={submitting}>
						{book ? t('Save') : t('Create')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && (
					<Alert color="error" compact>
						{error}
					</Alert>
				)}
				<Field label={t('Name')}>
					<Input
						placeholder={t('e.g., Personal')}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
					/>
				</Field>
				<Field label={t('Description (optional)')}>
					<Input value={description} onChange={(e) => setDescription(e.target.value)} />
				</Field>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
