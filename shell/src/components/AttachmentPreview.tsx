// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'
import { getFileUrl } from '@cloudillo/core'

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
	if (!attachmentIds.length) return null

	return (
		<div className={`c-hbox wrap ${compact ? 'g-1' : 'mu-2'}`}>
			{attachmentIds.map((id) => (
				<div key={id} className="pos-relative d-inline-block">
					<img
						className={compact ? 'c-thumbnail small' : 'c-thumbnail'}
						src={getFileUrl(idTag, id, 'vis.tn')}
						alt=""
					/>
					<button
						type="button"
						className="c-button icon small pos-absolute"
						style={{
							top: 2,
							right: 2,
							padding: 2,
							minWidth: 'auto',
							borderRadius: '50%'
						}}
						onClick={() => onRemove(id)}
					>
						<IcClose size={12} />
					</button>
				</div>
			))}
		</div>
	)
}

// vim: ts=4
