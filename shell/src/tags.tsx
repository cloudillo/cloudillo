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
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { usePopper } from 'react-popper'
import { useCombobox } from 'downshift'
import debounce from 'debounce'

import {
	LuPlus as IcPlus,
	LuMinus as IcMinus,
	LuHash as IcHash,
	LuX as IcDelete
} from 'react-icons/lu'

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

interface SelectProps<T> {
	className?: string
	inputClassName?: string
	getData: (q: string) => Promise<T[] | undefined>
	onChange?: (item: T) => void
	onSelectItem?: (item: T | undefined) => void
	itemToId: (item: T) => string
	itemToString: (item: T | null) => string
	renderItem: (props: T) => React.ReactNode
}
export function Select<T>({ className, inputClassName, getData, onChange, onSelectItem, itemToId, itemToString, renderItem }: SelectProps<T>) {
	const { t } = useTranslation()
	const [ popperRef, setPopperRef ] = React.useState<HTMLElement | null>(null)
	const [ popperEl, setPopperEl ] = React.useState<HTMLUListElement | null>(null)
	const [items, setItems] = React.useState<T[]>([])
	//const deboucedOnInputValueChange = React.useMemo(() => debounce(onInputValueChange, 500), [])
	const deboucedOnInputValueChange = debounce(onInputValueChange, 500)
	let tmpRef: React.MutableRefObject<HTMLUListElement> | undefined
	const {styles: popperStyles, attributes} = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})
	const s = useCombobox({
		onInputValueChange: deboucedOnInputValueChange,
		items,
		itemToString,
		//onSelect: (selectedItem: T | undefined) => {
		onSelectedItemChange: ({ selectedItem }) => {
			if (selectedItem) onChange?.(selectedItem)
			onSelectItem?.(selectedItem || undefined)
			s.setInputValue('')
		}
	})
	//console.log('usePopper', popperRef, popperEl, popperStyles.popper, attributes.popper)

	React.useEffect(function effect() {
		return function cleanup() {
			console.log('cleanup')
			deboucedOnInputValueChange.clear()
		}
	}, [])

	function getMenuProps() {
		const props = s.getMenuProps()
		return {
			...props,
			ref: (el: HTMLUListElement) => {
				//console.log('getMenuProps', el)
				setPopperEl(el)
				//if (props.ref) (props.ref as React.MutableRefObject<HTMLUListElement>).current = el
				if (props.ref) {
					if (typeof props.ref === 'function') {
						(props.ref as React.RefCallback<HTMLUListElement>)(el)
					} else {
						(props.ref as React.MutableRefObject<HTMLUListElement>).current = el
					}
				}
			}
		}
	}

	function onInputValueChange({ inputValue }: { inputValue?: string }) {
		getData(inputValue || '').then(i => setItems(i || []))
	}

	//return <details className={'c-dropdown ' + (className || '')} open={s.isOpen}>
	return <div className={'c-dropdown ' + (className || '')}>
		{/*
		<summary className="c-button secondary">
		*/}
		<summary ref={setPopperRef}>
			<input className={'c-input ' + (inputClassName || '')} autoFocus placeholder={t('Add tag...')} {...s.getInputProps()}/>
		</summary>
		{createPortal(<ul {...getMenuProps()} style={popperStyles.popper} className="c-nav flex-column" {...attributes.popper}>
			{items.map((item, idx) => <li key={idx} className={'c-nav-item' + (s.highlightedIndex === idx ? ' selected' : '')} {...s.getItemProps({ item, idx})}>
				{renderItem(item)}
			</li>)}
		</ul>, document.getElementById('popper-container')!)}
	</div>
	//</details>
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
		const ret = list && (list.find(t => t.tag === q) ? list : [q, ...list])
		//console.log('DATA', list, list?.find(t => t.tag === q), ret)
		return list && (list.find(t => t.tag === q) ? list : [{ tag: q, new: true }, ...list])
	}

	function renderItem(tag: Tag) {
		return <div className="c-link">
			<span style={{ width: '2rem' }}>{ tag.new ? <IcPlus/> : '' }</span>
			<span className={'c-tag small' + (tag.privileged ? ' warning' : '')}>{tag.tag}</span>
		</div>
	}

	function onAdd(tag?: Tag) {
		return tag && addTag?.(tag.tag)
	}

	function onRemove(tag: Tag) {
		return tag && removeTag?.(tag.tag)
	}

	return <>
			<div className="c-tag-list">
				{(tags || []).map((tag, i) => (
					<span key={i} className="c-button small">
						#{tag}
						<button className="c-link p-0 ps-1" onClick={() => onRemove({ tag })}><IcDelete/></button>
					</span>
				))}
				{!!addTag && !add && <button className="c-link" onClick={() => setAdd(true)}><IcPlus/></button>}
				{!!addTag && add && <button className="c-link" onClick={() => setAdd(false)}><IcMinus/></button>}
			</div>
			{add && <div className="c-input-group">
				<span className="c-button icon"><IcHash/></span>
				<Select className="flex-fill" getData={getData} itemToId={i => i.tag} itemToString={i => i?.tag || ''} renderItem={renderItem} onSelectItem={onAdd}/>
			</div>}
		</>
}

// vim: ts=4
