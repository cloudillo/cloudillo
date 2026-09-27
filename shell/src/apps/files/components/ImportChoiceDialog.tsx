// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Import Choice Dialog
 *
 * Shown when a user uploads a file that can be converted to a native
 * Cloudillo document. Lets the user choose between uploading as-is
 * or converting.
 */

import * as React from 'react'
import { Button, Dialog, Text, VBox } from '@cloudillo/react'
import { useTranslation } from 'react-i18next'
import { LuFileSpreadsheet as IcConvert, LuUpload as IcUpload } from 'react-icons/lu'

import type { ImportHandler } from '../../../manifest-registry.js'
import type { PendingConversion } from '../hooks/useSmartUpload.js'

export interface ImportChoiceDialogProps {
	pendingConversions: PendingConversion[]
	onUploadAsFile: (file: globalThis.File) => void
	onConvert: (file: globalThis.File, handler: ImportHandler) => void
	onDismissAll: () => void
}

export function ImportChoiceDialog({
	pendingConversions,
	onUploadAsFile,
	onConvert,
	onDismissAll
}: ImportChoiceDialogProps) {
	const { t } = useTranslation()

	if (pendingConversions.length === 0) return null

	// Show the first pending conversion
	const current = pendingConversions[0]

	return (
		<Dialog
			open
			title={t('Import file')}
			description={t('This file can be converted to a native document:')}
			onClose={onDismissAll}
		>
			<VBox gap={3}>
				<Text weight="bold">{current.file.name}</Text>

				<VBox gap={2}>
					{current.handlers.map((handler) => (
						<Button
							key={handler.manifest.id}
							color="primary"
							icon={<IcConvert />}
							onClick={() => onConvert(current.file, handler)}
						>
							{t('Convert to {{appName}}', { appName: handler.manifest.name })}
						</Button>
					))}

					<Button
						color="secondary"
						icon={<IcUpload />}
						onClick={() => onUploadAsFile(current.file)}
					>
						{t('Upload as file')}
					</Button>
				</VBox>

				{pendingConversions.length > 1 && (
					<Text emphasis="muted">
						{t('{{count}} more file(s) to process', {
							count: pendingConversions.length - 1
						})}
					</Text>
				)}
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
