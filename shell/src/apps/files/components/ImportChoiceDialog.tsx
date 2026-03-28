// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Import Choice Dialog
 *
 * Shown when a user uploads a file that can be converted to a native
 * Cloudillo document. Lets the user choose between uploading as-is
 * or converting.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuUpload as IcUpload,
	LuFileSpreadsheet as IcConvert,
	LuX as IcClose
} from 'react-icons/lu'

import type { PendingConversion } from '../hooks/useSmartUpload.js'
import type { ImportHandler } from '../../../manifest-registry.js'

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
		<div className="c-modal show" tabIndex={-1}>
			<div className="c-dialog c-panel h-max-100 emph p-4">
				<div className="c-hbox">
					<h2 className="fill mb-3">{t('Import file')}</h2>
					<button
						type="button"
						className="c-link pos-absolute top-0 right-0 m-3"
						aria-label={t('Close')}
						onClick={onDismissAll}
					>
						<IcClose />
					</button>
				</div>

				<p className="mb-3">{t('This file can be converted to a native document:')}</p>
				<p className="mb-4">
					<strong>{current.file.name}</strong>
				</p>

				<div className="c-vbox g-2">
					{current.handlers.map((handler) => (
						<button
							key={handler.manifest.id}
							type="button"
							className="c-button primary"
							onClick={() => onConvert(current.file, handler)}
						>
							<IcConvert />
							{t('Convert to {{appName}}', { appName: handler.manifest.name })}
						</button>
					))}

					<button
						type="button"
						className="c-button secondary"
						onClick={() => onUploadAsFile(current.file)}
					>
						<IcUpload />
						{t('Upload as file')}
					</button>
				</div>

				{pendingConversions.length > 1 && (
					<p className="mt-3 text-muted">
						{t('{{count}} more file(s) to process', {
							count: pendingConversions.length - 1
						})}
					</p>
				)}
			</div>
		</div>
	)
}

// vim: ts=4
