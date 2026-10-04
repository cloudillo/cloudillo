// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FiEdit2 as IcEdit } from 'react-icons/fi'

import { useContextAwareApi } from '../../../context/index.js'
import { EditTags, Tags } from '../../../tags.js'

interface TagsCellProps {
	entryId: string
	tags: string[] | undefined
	setTags?: (tags: string[] | undefined) => void
	editable?: boolean
}

export const TagsCell = React.memo(function TagsCell({
	entryId,
	tags,
	setTags,
	editable
}: TagsCellProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [isEditing, setIsEditing] = React.useState(false)

	async function listTags(prefix: string) {
		if (!api) return
		const res = await api.tags.list({ prefix })
		return res?.tags
	}

	async function addTag(tag: string) {
		if (!api) return
		const res = await api.files.addTag(entryId, tag)
		if (res.tags) setTags?.(res.tags)
	}

	async function removeTag(tag: string) {
		if (!api) return
		const res = await api.files.removeTag(entryId, tag)
		if (res.tags) setTags?.(res.tags)
	}

	if (isEditing) {
		return <EditTags tags={tags} listTags={listTags} addTag={addTag} removeTag={removeTag} />
	} else {
		return (
			<HBox gap={1} align="center" wrap>
				<Tags tags={tags} />
				{!!editable && (
					<Button
						variant="ghost"
						size="sm"
						icon={<IcEdit />}
						aria-label={t('Edit tags')}
						onClick={() => setIsEditing(true)}
					/>
				)}
			</HBox>
		)
	}
})

// vim: ts=4
