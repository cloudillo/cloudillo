// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useCombobox } from 'downshift'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'

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
	itemToId,
	itemToString,
	renderItem
}: SelectProps<T>) {
	const [popperRef, setPopperRef] = React.useState<HTMLElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLUListElement | null>(null)
	const [items, setItems] = React.useState<T[]>([])

	// Trailing-edge 500ms debounce of the async data fetch.
	// The generation counter drops superseded invocations — both the debounced wait
	// and an in-flight fetch whose response comes back out of order.
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const genRef = React.useRef(0)
	const debouncedOnInputValueChange = React.useCallback(
		async ({ inputValue }: { inputValue?: string }) => {
			// Superseded runs are discarded by the generation counter below, NOT by
			// clearing the timer here: that would leave the previous invocation parked
			// forever on a promise only its own timer could resolve.
			const gen = ++genRef.current
			await new Promise((resolve) => (timerRef.current = setTimeout(resolve, 500)))
			if (gen !== genRef.current) return
			const data = await getData(inputValue || '')
			if (gen !== genRef.current) return
			setItems(data || [])
		},
		[getData]
	)

	let _tmpRef: React.MutableRefObject<HTMLUListElement> | undefined
	const { styles: popperStyles, attributes } = usePopper(popperRef, popperEl, {
		placement: 'bottom-start',
		strategy: 'fixed'
	})
	// Dedupe by id so the itemToId keys stay unique (a getData collision would cause
	// React key clashes and mis-reconciliation) and identity-stable across debounced
	// updates. useCombobox/highlightedIndex and the menu render all use this list.
	const uniqueItems = React.useMemo(() => {
		const seen = new Set<string>()
		return items.filter((it) => {
			const id = itemToId(it)
			if (seen.has(id)) return false
			seen.add(id)
			return true
		})
	}, [items, itemToId])
	const s = useCombobox({
		onInputValueChange: (arg) => debouncedOnInputValueChange(arg),
		items: uniqueItems,
		itemToString,
		onSelectedItemChange: ({ selectedItem }) => {
			if (selectedItem) onChange?.(selectedItem)
			onSelectItem?.(selectedItem || undefined)
			s.setInputValue('')
		}
	})

	React.useEffect(function effect() {
		return function cleanup() {
			clearTimeout(timerRef.current)
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
					style={{
						...popperStyles.popper,
						...(s.isOpen && uniqueItems.length ? {} : { display: 'none' })
					}}
					className="c-select-menu c-nav flex-column text-start"
					{...attributes.popper}
				>
					{uniqueItems.map((item, idx) => (
						<li
							key={itemToId(item)}
							className={
								'c-nav-item' + (s.highlightedIndex === idx ? ' selected' : '')
							}
							{...s.getItemProps({ item, index: idx })}
						>
							{renderItem(item)}
						</li>
					))}
				</ul>,
				// `body` fallback: a non-null assertion here THROWS in any app
				// whose index.html lacks the container.
				document.getElementById('popper-container') ?? document.body
			)}
		</div>
	)
	//</details>
}

// vim: ts=4
