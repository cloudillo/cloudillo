// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useCombobox } from 'downshift'
import * as React from 'react'
import { createPortal } from 'react-dom'

import { FieldContext, useFieldControl } from '../Form/Field.js'
import { List, ListItem } from '../List/index.js'
import { LoadingSpinner } from '../Loading/index.js'
import { overlayContainer, useAnchoredPosition } from '../Popover/Popover.js'
import { mergeClasses } from '../utils.js'

export interface ComboboxProps<T> {
	className?: string
	inputClassName?: string
	placeholder?: string
	/** Accessible name when the Combobox is not inside a `Field`; defaults to `placeholder` */
	'aria-label'?: string
	autoFocus?: boolean
	/** Async option source, called debounced (500ms) with the typed query */
	getData: (q: string) => Promise<T[] | undefined>
	/** Option title */
	renderItem: (item: T) => React.ReactNode
	itemToId: (item: T) => string
	itemToString: (item: T | null) => string
	/** Fired on every pick; the input clears afterwards */
	onSelect?: (item: T) => void
	/** Group key per item; options are grouped under a header per key, in first-seen order */
	sections?: (item: T) => string
	leading?: (item: T) => React.ReactNode
	trailing?: (item: T) => React.ReactNode
	/** Keyboard hint shown at the end of the option */
	shortcut?: (item: T) => string | undefined
	/** Shown when a non-empty query returns no options */
	emptyText?: React.ReactNode
	/** Overrides the built-in in-flight indicator */
	loading?: boolean
	/** Keep the list open after a pick, for adding several items in a row */
	multiple?: boolean
}

export function Combobox<T>({
	className,
	inputClassName,
	placeholder,
	'aria-label': ariaLabel,
	autoFocus = true,
	getData,
	renderItem,
	itemToId,
	itemToString,
	onSelect,
	sections,
	leading,
	trailing,
	shortcut,
	emptyText,
	loading,
	multiple
}: ComboboxProps<T>) {
	const field = React.useContext(FieldContext)
	const [anchorEl, setAnchorEl] = React.useState<HTMLInputElement | null>(null)
	const [surfaceEl, setSurfaceEl] = React.useState<HTMLDivElement | null>(null)
	const [items, setItems] = React.useState<T[]>([])
	const [fetching, setFetching] = React.useState(false)
	const { style, attributes } = useAnchoredPosition(anchorEl, surfaceEl)
	const label = field ? undefined : (ariaLabel ?? placeholder)
	const control = useFieldControl<HTMLInputElement>(
		{ 'aria-label': label },
		setAnchorEl,
		'Combobox'
	)

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
			setFetching(true)
			try {
				const data = await getData(inputValue || '')
				if (gen !== genRef.current) return
				setItems(data || [])
			} finally {
				if (gen === genRef.current) setFetching(false)
			}
		},
		[getData]
	)

	React.useEffect(function effect() {
		return function cleanup() {
			clearTimeout(timerRef.current)
		}
	}, [])

	// Dedupe by id so the itemToId keys stay unique (a getData collision would cause
	// React key clashes and mis-reconciliation) and identity-stable across debounced
	// updates, then group by section keeping first-seen order: downshift indexes the
	// options in render order, so the grouped list is the one it gets.
	const orderedItems = React.useMemo(() => {
		const seen = new Set<string>()
		const unique = items.filter((it) => {
			const id = itemToId(it)
			if (seen.has(id)) return false
			seen.add(id)
			return true
		})
		if (!sections) return unique
		const groups = new Map<string, T[]>()
		for (const it of unique) {
			const key = sections(it)
			groups.set(key, [...(groups.get(key) ?? []), it])
		}
		return [...groups.values()].flat()
	}, [items, itemToId, sections])

	const s = useCombobox({
		items: orderedItems,
		itemToString,
		// Controlled to null: every pick is a change (so picking the same item twice
		// fires again) and the input never shows the picked item's text.
		selectedItem: null,
		inputId: field?.id,
		labelId: field?.labelId,
		onInputValueChange: (arg) => debouncedOnInputValueChange(arg),
		onSelectedItemChange: ({ selectedItem }) => {
			if (selectedItem) onSelect?.(selectedItem)
			s.setInputValue('')
		},
		stateReducer: (_state, { type, changes }) => {
			if (
				multiple &&
				(type === useCombobox.stateChangeTypes.ItemClick ||
					type === useCombobox.stateChangeTypes.InputKeyDownEnter)
			) {
				return { ...changes, isOpen: true, inputValue: '' }
			}
			return changes
		}
	})

	const busy = loading ?? fetching
	const visible = s.isOpen && (orderedItems.length > 0 || busy || (!!emptyText && !!s.inputValue))

	// Top layer without light dismiss: focus stays in the input, downshift closes it
	React.useLayoutEffect(() => {
		if (!surfaceEl || typeof surfaceEl.showPopover !== 'function') return
		try {
			if (visible) surfaceEl.showPopover()
			else surfaceEl.hidePopover()
		} catch {
			// already in that state
		}
	}, [surfaceEl, visible])

	const inputProps = s.getInputProps({ ref: control.ref, 'aria-label': label })
	const menuProps = s.getMenuProps({ 'aria-label': label })
	const sizeClass = control.size !== 'md' && control.size

	let lastSection: string | undefined
	return (
		<div className={className}>
			<input
				className={mergeClasses('c-input', sizeClass, inputClassName)}
				autoFocus={autoFocus}
				placeholder={placeholder}
				{...control.controlProps}
				{...inputProps}
			/>
			{createPortal(
				<div
					ref={setSurfaceEl}
					popover="manual"
					className="c-popper"
					style={{ ...style, ...(visible ? {} : { display: 'none' }) }}
					{...attributes}
				>
					<List selectable="single" scroll className="mh-md" {...menuProps}>
						{orderedItems.map((item, idx) => {
							const section = sections?.(item)
							const header = section !== undefined && section !== lastSection
							lastSection = section
							const { onClick, ...itemProps } = s.getItemProps({ item, index: idx })
							const highlighted = s.highlightedIndex === idx
							const key = shortcut?.(item)
							return (
								<React.Fragment key={itemToId(item)}>
									{header && (
										<li
											role="presentation"
											className="c-list-item-subtitle px-2 pt-2"
										>
											{section}
										</li>
									)}
									<ListItem
										{...itemProps}
										tabIndex={-1}
										aria-selected={highlighted}
										selected={highlighted}
										onClick={
											onClick as
												| ((evt: React.SyntheticEvent<HTMLElement>) => void)
												| undefined
										}
										leading={leading?.(item)}
										title={renderItem(item)}
										trailing={
											(trailing || key) && (
												<>
													{trailing?.(item)}
													{key && <kbd className="c-kbd">{key}</kbd>}
												</>
											)
										}
									/>
								</React.Fragment>
							)
						})}
					</List>
					{busy && orderedItems.length === 0 && (
						<LoadingSpinner size="sm" className="p-2" />
					)}
					{!busy && orderedItems.length === 0 && !!emptyText && (
						<div className="p-2 text-muted">{emptyText}</div>
					)}
				</div>,
				overlayContainer(anchorEl)
			)}
		</div>
	)
}

// vim: ts=4
