// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import { Button, FileTile, HBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose } from 'react-icons/lu'

export interface AttachmentPreviewProps {
	attachmentIds: string[]
	idTag: string
	onRemove: (id: string) => void
	compact?: boolean
}

export function AttachmentPreview({
	attachmentIds,
	idTag,
	onRemove,
	compact
}: AttachmentPreviewProps) {
	const { t } = useTranslation()

	if (!attachmentIds.length) return null

	return (
		<HBox wrap gap={compact ? 1 : 2} className={compact ? undefined : 'mu-2'}>
			{attachmentIds.map((id, i) => {
				const name = t('Attachment {{n}}', { n: i + 1 })
				return (
					<FileTile
						key={id}
						name={name}
						src={getFileUrl(idTag, id, 'vis.tn')}
						style={{ width: compact ? '4rem' : '6rem' }}
						actions={
							<Button
								variant="ghost"
								size="xs"
								icon={<IcClose />}
								aria-label={t('Remove {{name}}', { name })}
								onClick={() => onRemove(id)}
							/>
						}
					/>
				)
			})}
		</HBox>
	)
}

// vim: ts=4
