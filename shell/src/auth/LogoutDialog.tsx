// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLogOut as IcLogout, LuCircleAlert as IcWarning } from 'react-icons/lu'

import { Button } from '@cloudillo/react'

import type { DirtyDocSummary } from './wipe-local-data.js'

const CONFIRM_PHRASE = 'LOGOUT'

// A doc has only its raw id as a "name" when the file-cache lookup missed —
// render those in monospace so users see at a glance that they're synthetic.
function isPlaceholderName(d: DirtyDocSummary): boolean {
	const colonIdx = d.docId.indexOf(':')
	return d.name === d.docId || (colonIdx >= 0 && d.name === d.docId.slice(colonIdx + 1))
}

interface LogoutDialogProps {
	open: boolean
	idTag?: string
	dirtyDocs: DirtyDocSummary[]
	onCancel: () => void
	onConfirm: () => void
}

export function LogoutDialog({ open, idTag, dirtyDocs, onCancel, onConfirm }: LogoutDialogProps) {
	const { t } = useTranslation()
	const dialogRef = React.useRef<HTMLDialogElement>(null)
	const cancelRef = React.useRef<HTMLButtonElement>(null)
	const [confirmText, setConfirmText] = React.useState('')

	React.useEffect(() => {
		if (open) {
			dialogRef.current?.showModal()
			setConfirmText('')
			// Default focus to Cancel so accidental Enter doesn't sign out.
			setTimeout(() => cancelRef.current?.focus(), 0)
		} else {
			dialogRef.current?.close()
		}
	}, [open])

	if (!open) return null

	const hasDirty = dirtyDocs.length > 0
	const canConfirm = !hasDirty || confirmText === CONFIRM_PHRASE

	return (
		<dialog
			ref={dialogRef}
			className="c-error-dialog"
			aria-labelledby="logout-dialog-title"
			onCancel={(e) => {
				e.preventDefault()
				onCancel()
			}}
		>
			<div className="c-card c-logout-dialog__card p-4">
				<div className="c-hbox align-items-center g-2 mb-3">
					{hasDirty && <IcWarning size={32} className="text-error" />}
					<h2 id="logout-dialog-title" className="m-0">
						{hasDirty
							? t('Unsynced changes will be lost')
							: t('Sign out of {{idTag}}', { idTag: idTag ?? '' })}
					</h2>
				</div>

				{hasDirty ? (
					<>
						<p className="mb-2">
							{t(
								"You have {{count}} document(s) with edits that haven't reached the server.",
								{ count: dirtyDocs.length }
							)}
						</p>
						<ul className="c-vbox c-logout-dialog__list g-1 p-2 mb-3">
							{dirtyDocs.map((d) => (
								<li
									key={d.docId}
									className={
										isPlaceholderName(d)
											? 'c-logout-dialog__placeholder-name'
											: undefined
									}
								>
									{d.name}
								</li>
							))}
						</ul>
						<p className="mb-3 text-error">
							{t(
								'Signing out now will permanently discard these edits. They cannot be recovered.'
							)}
						</p>
						<p className="mb-2 text-muted">
							{t(
								'Tip: open the documents in their apps and let them sync, then return here.'
							)}
						</p>
						<label className="c-vbox g-1 mb-3">
							<span>
								{t('Type {{phrase}} to confirm', { phrase: CONFIRM_PHRASE })}
							</span>
							<input
								type="text"
								className="c-input"
								value={confirmText}
								onChange={(e) => setConfirmText(e.target.value)}
								placeholder={CONFIRM_PHRASE}
								autoComplete="off"
								spellCheck={false}
							/>
						</label>
					</>
				) : (
					<>
						<p className="mb-3">
							{t(
								'Signing out will permanently remove all locally cached data and the encryption key from this device.'
							)}
						</p>
						<p className="mb-3 text-muted">
							{t(
								'Your data on the server is unaffected. Signing back in will re-download what you need.'
							)}
						</p>
					</>
				)}

				<div className="c-hbox g-2 justify-content-end">
					<Button ref={cancelRef} onClick={onCancel}>
						{t('Cancel')}
					</Button>
					<Button className="error" onClick={onConfirm} disabled={!canConfirm}>
						<IcLogout />
						{t('Sign out')}
					</Button>
				</div>
			</div>
		</dialog>
	)
}

// vim: ts=4
