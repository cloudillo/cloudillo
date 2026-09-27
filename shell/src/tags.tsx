// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Combobox, HBox, Tag } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuHash as IcHash, LuMinus as IcMinus, LuPlus as IcPlus } from 'react-icons/lu'

export function Tags({ tags }: { tags?: string[] }) {
	return (
		<>
			{(tags || []).map((tag, i) => (
				<Tag key={i}>#{tag}</Tag>
			))}
		</>
	)
}

interface TagItem {
	tag: string
	privileged?: boolean
	new?: boolean
}

interface EditTagsProps {
	tags?: string[]
	listTags: (q: string) => Promise<TagItem[] | undefined>
	addTag?: (tag: string) => Promise<void>
	removeTag?: (tag: string) => Promise<void>
}
export function EditTags({ tags, listTags, addTag, removeTag }: EditTagsProps) {
	const [add, setAdd] = React.useState(false)
	const { t } = useTranslation()

	async function getData(q: string): Promise<TagItem[] | undefined> {
		if (!q) return []

		const list = await listTags(q)
		const _ret = list && (list.find((t) => t.tag === q) ? list : [q, ...list])
		//console.log('DATA', list, list?.find(t => t.tag === q), ret)
		return list && (list.find((t) => t.tag === q) ? list : [{ tag: q, new: true }, ...list])
	}

	function renderItem(tag: TagItem) {
		return (
			<Tag size="sm" color={tag.privileged ? 'warning' : undefined}>
				{tag.tag}
			</Tag>
		)
	}

	function onAdd(tag?: TagItem) {
		return tag && addTag?.(tag.tag)
	}

	function onRemove(tag: TagItem) {
		return tag && removeTag?.(tag.tag)
	}

	return (
		<>
			<HBox wrap gap={1} align="center">
				{(tags || []).map((tag, i) => (
					<Tag
						key={i}
						onRemove={() => onRemove({ tag })}
						removeLabel={t('Remove tag {{tag}}', { tag })}
					>
						#{tag}
					</Tag>
				))}
				{!!addTag && (
					<Button
						variant="ghost"
						size="sm"
						icon={add ? <IcMinus /> : <IcPlus />}
						aria-label={add ? t('Cancel') : t('Add tag')}
						aria-expanded={add}
						onClick={() => setAdd(!add)}
					/>
				)}
			</HBox>
			{add && (
				<HBox gap={1} align="center">
					<IcHash aria-hidden="true" />
					<Combobox
						className="flex-fill"
						placeholder={t('Add tag...')}
						aria-label={t('Add tag')}
						getData={getData}
						itemToId={(i) => i.tag}
						itemToString={(i) => i?.tag || ''}
						renderItem={renderItem}
						leading={(i) => (i.new ? <IcPlus /> : undefined)}
						onSelect={onAdd}
					/>
				</HBox>
			)}
		</>
	)
}

// vim: ts=4
