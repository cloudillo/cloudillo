// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
