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
import { FiEdit2 as IcEdit } from 'react-icons/fi'
import { useApi, Button } from '@cloudillo/react'
import { Tags, EditTags } from '../../../tags.js'

interface TagsCellProps {
	fileId: string
	tags: string[] | undefined
	setTags?: (tags: string[] | undefined) => void
	editable?: boolean
}

export const TagsCell = React.memo(function TagsCell({
	fileId,
	tags,
	setTags,
	editable
}: TagsCellProps) {
	const { api } = useApi()
	const [isEditing, setIsEditing] = React.useState(false)

	async function listTags(prefix: string) {
		if (!api) return
		const res = await api.tags.list({ prefix })
		return res?.tags
	}

	async function addTag(tag: string) {
		if (!api) return
		const res = await api.files.addTag(fileId, tag)
		if (res.tags) setTags?.(res.tags)
	}

	async function removeTag(tag: string) {
		if (!api) return
		const res = await api.files.removeTag(fileId, tag)
		if (res.tags) setTags?.(res.tags)
	}

	if (isEditing) {
		return <EditTags tags={tags} listTags={listTags} addTag={addTag} removeTag={removeTag} />
	} else {
		return (
			<div className="c-tag-list g-1">
				<Tags tags={tags} />
				{!!editable && (
					<Button link onClick={() => setIsEditing(true)}>
						<IcEdit />
					</Button>
				)}
			</div>
		)
	}
})

// vim: ts=4
