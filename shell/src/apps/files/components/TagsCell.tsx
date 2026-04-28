// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { FiEdit2 as IcEdit } from 'react-icons/fi'
import { Button } from '@cloudillo/react'
import { useContextAwareApi } from '../../../context/index.js'
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
	const { api } = useContextAwareApi()
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
					<Button kind="link" onClick={() => setIsEditing(true)}>
						<IcEdit />
					</Button>
				)}
			</div>
		)
	}
})

// vim: ts=4
