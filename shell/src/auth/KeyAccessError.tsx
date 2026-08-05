// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTrash2 as IcClear,
	LuRefreshCw as IcRefresh,
	LuCircleAlert as IcWarning
} from 'react-icons/lu'

import { recoverFromKeyLoss } from './key-loss.js'
import type { DirtyDocSummary } from './wipe-local-data.js'

/**
 * Blocking overlay shown when the encryption key is gone *and* documents with
 * unsynced local edits would be lost with it.
 *
 * Key loss on its own is not an error — everything else under that key is a
 * cache and `assessKeyLoss()` repairs it silently (see auth/key-loss.ts). This
 * dialog exists purely so the user, not the app, decides the fate of work that
 * never reached the server.
 */
export function KeyAccessError({
	dirtyDocs,
	onReload
}: {
	dirtyDocs: DirtyDocSummary[]
	onReload: () => void
}) {
	const { t } = useTranslation()
	const [resetting, setResetting] = React.useState(false)
	const [confirmReset, setConfirmReset] = React.useState(false)
	const dialogRef = React.useRef<HTMLDialogElement>(null)

	// Use native dialog with showModal() for built-in focus trapping
	React.useEffect(() => {
		dialogRef.current?.showModal()
	}, [])

	async function handleReset() {
		if (!confirmReset) {
			setConfirmReset(true)
			return
		}
		setResetting(true)
		await recoverFromKeyLoss()
		onReload()
	}

	return (
		<dialog
			ref={dialogRef}
			className="c-error-dialog"
			aria-labelledby="key-error-title"
			onCancel={(e) => e.preventDefault()}
		>
			<div className="c-card p-4" style={{ maxWidth: 480 }}>
				<div className="c-hbox align-items-center g-2 mb-3">
					<IcWarning size={32} className="text-error" />
					<h2 id="key-error-title" className="m-0">
						{t('Unsynced work at risk')}
					</h2>
				</div>
				<p className="mb-3">
					{t(
						'Your encryption key is missing, so the data stored on this device can no longer be read. This can happen if your browser cookie storage was temporarily inaccessible (e.g. when Chrome cannot access its encrypted database).'
					)}
				</p>
				<p className="mb-3">
					{t('These documents have local changes that were never sent to the server:')}
				</p>
				<ul className="mb-4">
					{dirtyDocs.map((doc) => (
						<li key={doc.docId}>{doc.name}</li>
					))}
				</ul>
				<p className="mb-4 text-muted">
					{t('Reloading often restores the key. Try that before discarding anything.')}
				</p>
				{confirmReset && (
					<p className="mb-3 text-error">
						{t(
							'This will discard those unsynced changes along with all other locally stored data, and require you to log in again. Click again to confirm.'
						)}
					</p>
				)}
				<div className="c-hbox g-2 justify-content-end">
					<Button onClick={handleReset} disabled={resetting}>
						<IcClear />
						{confirmReset
							? t('Confirm Discard')
							: t('Discard {{count}} unsynced documents', {
									count: dirtyDocs.length
								})}
					</Button>
					<Button className="primary" onClick={onReload} disabled={resetting}>
						<IcRefresh />
						{t('Retry')}
					</Button>
				</div>
			</div>
		</dialog>
	)
}
// vim: ts=4
