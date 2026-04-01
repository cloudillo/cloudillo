// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { useCombobox } from 'downshift'
import debounce from 'debounce'

export interface SelectProps<T> {
	className?: string
	inputClassName?: string
	placeholder?: string
	getData: (q: string) => Promise<T[] | undefined>
	onChange?: (item: T) => void
	onSelectItem?: (item: T | undefined) => void
	itemToId: (item: T) => string
	itemToString: (item: T | null) => string
	renderItem: (props: T) => React.ReactNode
}

export function Select<T>({
	className,
	inputClassName,
	placeholder,
	getData,
	onChange,
	onSelectItem,
	itemToString,
	renderItem
}: SelectProps<T>) {
	const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLUListElement | null>(null)
	const [items, setItems] = React.useState<T[]>([])

	const deboucedOnInputValueChange = React.useCallback(
		debounce(async function onInputValueChange({ inputValue }: { inputValue?: string }) {
			const data = await getData(inputValue || '')
			setItems(data || [])
		}, 500),
		[]
	)

	let _tmpRef: React.MutableRefObject<HTMLUListElement> | undefined
	const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})
	const s = useCombobox({
		onInputValueChange: (arg) => deboucedOnInputValueChange(arg),
		items,
		itemToString,
		onSelectedItemChange: ({ selectedItem }) => {
			if (selectedItem) onChange?.(selectedItem)
			onSelectItem?.(selectedItem || undefined)
			s.setInputValue('')
		}
	})

	React.useEffect(function effect() {
		return function cleanup() {
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
						;(props.ref as React.RefCallback<HTMLUListElement>)(el)
					} else {
						;(props.ref as React.MutableRefObject<HTMLUListElement>).current = el
					}
				}
			}
		}
	}

	//return <div className={'c-dropdown ' + (className || '')}>
	return (
		<div className={className}>
			{/*
		<summary className="c-button secondary">
		<summary>
		*/}
			<div ref={setPopperRef}>
				<input
					className={'c-input ' + (inputClassName || '')}
					autoFocus
					placeholder={placeholder}
					{...s.getInputProps()}
				/>
			</div>
			{/*
		</summary>
		*/}
			{createPortal(
				<ul
					{...getMenuProps()}
					style={{ ...popperStyles.popper, ...(items.length ? {} : { display: 'none' }) }}
					className="c-nav flex-column text-start"
					{...attributes.popper}
				>
					{items.map((item, idx) => (
						<li
							key={idx}
							className={
								'c-nav-item' + (s.highlightedIndex === idx ? ' selected' : '')
							}
							{...s.getItemProps({ item, idx })}
						>
							{renderItem(item)}
						</li>
					))}
				</ul>,
				document.getElementById('popper-container')!
			)}
		</div>
	)
	//</details>
}

// vim: ts=4
