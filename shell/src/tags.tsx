// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuPlus as IcPlus,
	LuMinus as IcMinus,
	LuHash as IcHash,
	LuX as IcDelete
} from 'react-icons/lu'

import { Select } from '@cloudillo/react'

export function Tags({ tags }: { tags?: string[] }) {
	return (
		<>
			{(tags || []).map((tag, i) => (
				<span key={i} className="c-tag">
					#{tag}
				</span>
			))}
		</>
	)
}

interface Tag {
	tag: string
	privileged?: boolean
	new?: boolean
}

interface EditTagsProps {
	tags?: string[]
	listTags: (q: string) => Promise<Tag[] | undefined>
	addTag?: (tag: string) => Promise<void>
	removeTag?: (tag: string) => Promise<void>
}
export function EditTags({ tags, listTags, addTag, removeTag }: EditTagsProps) {
	const [add, setAdd] = React.useState(false)
	const { t } = useTranslation()

	async function getData(q: string): Promise<Tag[] | undefined> {
		if (!q) return []

		const list = await listTags(q)
		const _ret = list && (list.find((t) => t.tag === q) ? list : [q, ...list])
		//console.log('DATA', list, list?.find(t => t.tag === q), ret)
		return list && (list.find((t) => t.tag === q) ? list : [{ tag: q, new: true }, ...list])
	}

	function renderItem(tag: Tag) {
		return (
			<div className="c-link">
				<span style={{ width: '2rem' }}>{tag.new ? <IcPlus /> : ''}</span>
				<span className={'c-tag small' + (tag.privileged ? ' warning' : '')}>
					{tag.tag}
				</span>
			</div>
		)
	}

	function onAdd(tag?: Tag) {
		return tag && addTag?.(tag.tag)
	}

	function onRemove(tag: Tag) {
		return tag && removeTag?.(tag.tag)
	}

	return (
		<>
			<div className="c-tag-list">
				{(tags || []).map((tag, i) => (
					<span key={i} className="c-button small">
						#{tag}
						<button className="c-link p-0 ps-1" onClick={() => onRemove({ tag })}>
							<IcDelete />
						</button>
					</span>
				))}
				{!!addTag && !add && (
					<button className="c-link" onClick={() => setAdd(true)}>
						<IcPlus />
					</button>
				)}
				{!!addTag && add && (
					<button className="c-link" onClick={() => setAdd(false)}>
						<IcMinus />
					</button>
				)}
			</div>
			{add && (
				<div className="c-input-group">
					<span className="c-button icon">
						<IcHash />
					</span>
					<Select
						className="flex-fill"
						placeholder={t('Add tag...')}
						getData={getData}
						itemToId={(i) => i.tag}
						itemToString={(i) => i?.tag || ''}
						renderItem={renderItem}
						onSelectItem={onAdd}
					/>
				</div>
			)}
		</>
	)
}

// vim: ts=4
