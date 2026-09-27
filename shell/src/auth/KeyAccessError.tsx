// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	ActionBar,
	Button,
	Dialog,
	DialogContainer,
	List,
	ListItem,
	Text,
	useDialog
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTrash2 as IcClear,
	LuRefreshCw as IcRefresh,
	LuCircleAlert as IcWarning
} from 'react-icons/lu'

import { recoverFromKeyLoss } from './key-loss.js'
import type { DirtyDocSummary } from './wipe-local-data.js'

const CONFIRM_PHRASE = 'DISCARD'

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
	const dialog = useDialog()
	const [resetting, setResetting] = React.useState(false)

	async function handleReset() {
		const ok = await dialog.confirm(
			t('Discard unsynced work?'),
			t(
				'This will discard those unsynced changes along with all other locally stored data, and require you to log in again.'
			),
			{ color: 'error', confirmLabel: t('Discard'), requireText: CONFIRM_PHRASE }
		)
		if (!ok) return
		setResetting(true)
		await recoverFromKeyLoss()
		onReload()
	}

	return (
		<>
			<Dialog
				open
				size="sm"
				dismissable={false}
				icon={<IcWarning size={32} className="text-error" />}
				title={t('Unsynced work at risk')}
				footer={
					<ActionBar>
						<Button
							color="error"
							icon={<IcClear />}
							onClick={handleReset}
							loading={resetting}
							disabled={resetting}
						>
							{t('Discard {{count}} unsynced documents', { count: dirtyDocs.length })}
						</Button>
						<Button
							color="primary"
							icon={<IcRefresh />}
							onClick={onReload}
							disabled={resetting}
						>
							{t('Retry')}
						</Button>
					</ActionBar>
				}
			>
				<Text as="p">
					{t(
						'Your encryption key is missing, so the data stored on this device can no longer be read. This can happen if your browser cookie storage was temporarily inaccessible (e.g. when Chrome cannot access its encrypted database).'
					)}
				</Text>
				<Text as="p">
					{t('These documents have local changes that were never sent to the server:')}
				</Text>
				<List marker="bullet">
					{dirtyDocs.map((doc) => (
						<ListItem key={doc.docId}>{doc.name}</ListItem>
					))}
				</List>
				<Text as="p" emphasis="muted">
					{t('Reloading often restores the key. Try that before discarding anything.')}
				</Text>
			</Dialog>
			{/* The shell's own DialogContainer is not mounted while this screen replaces it. */}
			<DialogContainer />
		</>
	)
}

// vim: ts=4
