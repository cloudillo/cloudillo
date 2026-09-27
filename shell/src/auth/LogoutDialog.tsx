// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ActionBar, Button, Dialog, Field, Input, List, ListItem, Text } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuLogOut as IcLogout, LuCircleAlert as IcWarning } from 'react-icons/lu'

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
	const [confirmText, setConfirmText] = React.useState('')

	React.useEffect(() => {
		if (open) setConfirmText('')
	}, [open])

	if (!open) return null

	const hasDirty = dirtyDocs.length > 0
	const canConfirm = !hasDirty || confirmText === CONFIRM_PHRASE

	return (
		<Dialog
			open
			size="sm"
			onClose={onCancel}
			icon={hasDirty && <IcWarning size={32} className="text-error" />}
			title={
				hasDirty
					? t('Unsynced changes will be lost')
					: t('Sign out of {{idTag}}', { idTag: idTag ?? '' })
			}
			footer={
				<ActionBar>
					{/* Default focus on Cancel so accidental Enter doesn't sign out. */}
					<Button autoFocus onClick={onCancel}>
						{t('Cancel')}
					</Button>
					<Button
						color="error"
						icon={<IcLogout />}
						onClick={onConfirm}
						disabled={!canConfirm}
					>
						{t('Sign out')}
					</Button>
				</ActionBar>
			}
		>
			{hasDirty ? (
				<>
					<Text as="p">
						{t(
							"You have {{count}} document(s) with edits that haven't reached the server.",
							{ count: dirtyDocs.length }
						)}
					</Text>
					<List variant="bordered">
						{dirtyDocs.map((d) => (
							<ListItem
								key={d.docId}
								title={<Text mono={isPlaceholderName(d)}>{d.name}</Text>}
							/>
						))}
					</List>
					<Text as="p" color="error">
						{t(
							'Signing out now will permanently discard these edits. They cannot be recovered.'
						)}
					</Text>
					<Text as="p" emphasis="muted">
						{t(
							'Tip: open the documents in their apps and let them sync, then return here.'
						)}
					</Text>
					<Field label={t('Type {{phrase}} to confirm', { phrase: CONFIRM_PHRASE })}>
						<Input
							type="text"
							value={confirmText}
							onChange={(e) => setConfirmText(e.target.value)}
							placeholder={CONFIRM_PHRASE}
							autoComplete="off"
							spellCheck={false}
						/>
					</Field>
				</>
			) : (
				<>
					<Text as="p">
						{t(
							'Signing out will permanently remove all locally cached data and the encryption key from this device.'
						)}
					</Text>
					<Text as="p" emphasis="muted">
						{t(
							'Your data on the server is unaffected. Signing back in will re-download what you need.'
						)}
					</Text>
				</>
			)}
		</Dialog>
	)
}

// vim: ts=4
