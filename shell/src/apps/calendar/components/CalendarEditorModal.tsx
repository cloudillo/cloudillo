// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ActionBar, Alert, Button, Dialog } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export interface CalendarEditorModalProps {
	open: boolean
	title: string
	/** `true` when editing an existing object — switches the primary button
	 *  label between "Save" and "Create". */
	edit: boolean
	submitting: boolean
	error?: string
	onClose: () => void
	onSubmit: (e?: React.FormEvent) => void | Promise<void>
	/** EventEditor uses `md` for its wider body. */
	size?: 'sm' | 'md'
	children: React.ReactNode
}

/** Shared dialog chrome for the three calendar editors (Event / Task / Calendar).
 *  Owns the title, error alert, and footer buttons — editors provide only the
 *  body fields and the submit handler. */
export function CalendarEditorModal({
	open,
	title,
	edit,
	submitting,
	error,
	onClose,
	onSubmit,
	size = 'sm',
	children
}: CalendarEditorModalProps) {
	const { t } = useTranslation()
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={title}
			size={size}
			onSubmit={onSubmit}
			footer={
				<ActionBar>
					<Button type="button" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button type="submit" color="primary" loading={submitting}>
						{edit ? t('Save') : t('Create')}
					</Button>
				</ActionBar>
			}
		>
			{error && (
				<Alert color="error" compact className="mb-3">
					{error}
				</Alert>
			)}
			{children}
		</Dialog>
	)
}

// vim: ts=4
