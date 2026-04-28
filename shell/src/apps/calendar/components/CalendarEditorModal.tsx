// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Modal } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

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
	/** Override the default 480px max. EventEditor uses 540px for its wider body. */
	maxWidth?: string
	children: React.ReactNode
}

/** Shared modal chrome for the three calendar editors (Event / Task / Calendar).
 *  Owns the header, error alert, and footer buttons — editors provide only the
 *  body fields and the submit handler. */
export function CalendarEditorModal({
	open,
	title,
	edit,
	submitting,
	error,
	onClose,
	onSubmit,
	maxWidth = '480px',
	children
}: CalendarEditorModalProps) {
	const { t } = useTranslation()
	return (
		<Modal open={open} onClose={onClose}>
			<form
				className="c-dialog c-panel emph c-cal-editor"
				style={{ maxWidth, width: '100%' }}
				onSubmit={onSubmit}
			>
				<div className="c-cal-editor__header">
					<h3 className="m-0">{title}</h3>
					<button
						type="button"
						className="c-link"
						onClick={onClose}
						aria-label={t('Close')}
					>
						<IcClose />
					</button>
				</div>

				<div className="c-cal-editor__body">
					{error && (
						<div
							className="c-panel bg-container-error p-2 mb-3"
							role="alert"
							aria-live="polite"
						>
							<span className="text-error">{error}</span>
						</div>
					)}
					{children}
				</div>

				<div className="c-cal-editor__footer">
					<Button type="button" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button type="submit" variant="primary" disabled={submitting}>
						{submitting ? t('Saving...') : edit ? t('Save') : t('Create')}
					</Button>
				</div>
			</form>
		</Modal>
	)
}

// vim: ts=4
