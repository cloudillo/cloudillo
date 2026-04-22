// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useCombobox } from 'downshift'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { mergeClasses } from '../utils.js'

export interface TimePickerProps {
	/** Current time as `HH:MM` 24-hour string. Empty when unset. */
	value: string
	onChange: (value: string) => void
	/** Minutes between dropdown entries. Default 15. */
	step?: number
	placeholder?: string
	/** Accessible label for the input. */
	label?: string
	className?: string
	inputClassName?: string
	disabled?: boolean
	/** Portal target for the dropdown. Defaults to `#popper-container`. */
	portalTarget?: HTMLElement | null
	/** Called when the input loses focus (after commit). */
	onBlur?: () => void
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n)
}

function buildTimeOptions(step: number): string[] {
	const out: string[] = []
	for (let mins = 0; mins < 24 * 60; mins += step) {
		const h = Math.floor(mins / 60)
		const m = mins % 60
		out.push(`${pad2(h)}:${pad2(m)}`)
	}
	return out
}

/** Permissive parser for free-form time text. Returns a normalised `HH:MM`
 *  string or null. */
function parseTime(raw: string): string | null {
	const s = raw.trim()
	if (!s) return null
	// HH:MM / H:MM / HH:M / H:M
	const colon = s.match(/^(\d{1,2}):(\d{1,2})$/)
	if (colon) {
		const h = Number(colon[1])
		const m = Number(colon[2])
		if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${pad2(h)}:${pad2(m)}`
		return null
	}
	// HHMM / HMM (3-4 digits, no separator)
	const digits = s.match(/^(\d{3,4})$/)
	if (digits) {
		const str = digits[1]
		const h = Number(str.slice(0, str.length - 2))
		const m = Number(str.slice(-2))
		if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${pad2(h)}:${pad2(m)}`
		return null
	}
	// Hour only (1-2 digits)
	const hourOnly = s.match(/^(\d{1,2})$/)
	if (hourOnly) {
		const h = Number(hourOnly[1])
		if (h >= 0 && h <= 23) return `${pad2(h)}:00`
		return null
	}
	return null
}

/**
 * Controlled combobox for picking a 24-hour time. Shows a dropdown of
 * step-minute intervals (default 15) with typeahead filtering; accepts
 * free-form typed values like `09:05` via the permissive parser.
 *
 * Styling mirrors the library's `Select` component: `c-input` on the text
 * input and a `c-nav` list with `c-nav-item` options, portalled to
 * `#popper-container` so popups float above modals.
 */
export function TimePicker({
	value,
	onChange,
	step = 15,
	placeholder,
	label,
	className,
	inputClassName,
	disabled,
	portalTarget,
	onBlur
}: TimePickerProps) {
	const allOptions = React.useMemo(() => buildTimeOptions(step), [step])

	const [anchorRef, setAnchorRef] = React.useState<HTMLElement | null>(null)
	const [menuEl, setMenuEl] = React.useState<HTMLUListElement | null>(null)

	const { styles: popperStyles, attributes: popperAttrs } = usePopper(anchorRef, menuEl, {
		placement: 'bottom-start',
		strategy: 'fixed',
		modifiers: [{ name: 'offset', options: { offset: [0, 4] } }]
	})

	const [inputText, setInputText] = React.useState(value)
	const [filter, setFilter] = React.useState('')

	// When the external value changes (e.g. auto-sync), mirror it into the
	// visible input text so the user sees the updated time.
	React.useEffect(() => {
		setInputText(value)
	}, [value])

	const filteredOptions = React.useMemo(() => {
		const q = filter.trim()
		if (!q) return allOptions
		return allOptions.filter((opt) => opt.startsWith(q))
	}, [allOptions, filter])

	function commitRaw(text: string) {
		const parsed = parseTime(text)
		if (parsed) {
			if (parsed !== value) onChange(parsed)
			setInputText(parsed)
		} else {
			setInputText(value)
		}
	}

	const {
		isOpen,
		getInputProps,
		getMenuProps,
		getItemProps,
		highlightedIndex,
		openMenu,
		closeMenu,
		setHighlightedIndex
	} = useCombobox({
		items: filteredOptions,
		inputValue: inputText,
		selectedItem: value || null,
		itemToString: (item) => item ?? '',
		onInputValueChange: ({ inputValue, type }) => {
			// Track what the user typed (or clear if any internal reset).
			setInputText(inputValue ?? '')
			// Only treat user-typed changes as filter input.
			if (type === useCombobox.stateChangeTypes.InputChange) {
				setFilter(inputValue ?? '')
			}
		},
		onSelectedItemChange: ({ selectedItem }) => {
			if (!selectedItem) return
			if (selectedItem !== value) onChange(selectedItem)
			setInputText(selectedItem)
			setFilter('')
		},
		stateReducer: (state, { type, changes }) => {
			// Keep the selected item's label in the input after selection instead
			// of downshift's default behaviour of reflecting whatever item index
			// happens to be highlighted.
			switch (type) {
				case useCombobox.stateChangeTypes.InputKeyDownEnter:
				case useCombobox.stateChangeTypes.ItemClick:
					return {
						...changes,
						inputValue: changes.selectedItem ?? state.inputValue,
						isOpen: false
					}
				case useCombobox.stateChangeTypes.InputBlur:
					// We commit via our own onBlur handler (parser-aware); let
					// downshift close the menu but don't let it reset the input
					// text.
					return {
						...changes,
						inputValue: state.inputValue
					}
				default:
					return changes
			}
		}
	})

	// Align the highlighted item with the current value when the menu opens,
	// so the user sees where they are in the list.
	React.useEffect(() => {
		if (!isOpen) return
		const idx = filteredOptions.indexOf(value)
		if (idx >= 0 && highlightedIndex !== idx) {
			setHighlightedIndex(idx)
		}
	}, [isOpen, filteredOptions, value, highlightedIndex, setHighlightedIndex])

	// Scroll the highlighted item into view whenever the highlight moves while
	// the menu is open — covers both the initial sync above and keyboard nav.
	React.useEffect(() => {
		if (!isOpen || !menuEl || highlightedIndex < 0) return
		const item = menuEl.children[highlightedIndex] as HTMLElement | undefined
		item?.scrollIntoView({ block: 'nearest' })
	}, [isOpen, menuEl, highlightedIndex])

	const target =
		portalTarget === undefined
			? typeof document !== 'undefined'
				? document.getElementById('popper-container')
				: null
			: portalTarget

	const menu = (
		<ul
			{...getMenuProps({
				ref: (el: HTMLUListElement | null) => {
					setMenuEl(el)
				}
			})}
			className="c-nav flex-column text-start c-time-picker-menu"
			style={{
				...popperStyles.popper,
				...(isOpen && filteredOptions.length ? {} : { display: 'none' })
			}}
			{...popperAttrs.popper}
		>
			{isOpen &&
				filteredOptions.map((opt, idx) => (
					<li
						key={opt}
						className={mergeClasses(
							'c-nav-item',
							highlightedIndex === idx && 'selected',
							value === opt && 'active'
						)}
						{...getItemProps({ item: opt, index: idx })}
					>
						{opt}
					</li>
				))}
		</ul>
	)

	return (
		<div className={mergeClasses('c-time-picker', className)}>
			<div ref={setAnchorRef}>
				<input
					{...getInputProps({
						onFocus: () => openMenu(),
						onBlur: () => {
							commitRaw(inputText)
							closeMenu()
							onBlur?.()
						},
						onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
							if (e.key === 'Escape') {
								setInputText(value)
								setFilter('')
								closeMenu()
							} else if (e.key === 'Tab') {
								commitRaw(inputText)
								closeMenu()
							} else if (e.key === 'Enter') {
								// If downshift has a highlighted item it'll take
								// over via onSelectedItemChange. Otherwise parse
								// the raw input.
								if (highlightedIndex < 0) {
									e.preventDefault()
									commitRaw(inputText)
									closeMenu()
								}
							}
						}
					})}
					className={mergeClasses('c-input', inputClassName)}
					placeholder={placeholder}
					aria-label={label}
					disabled={disabled}
					autoComplete="off"
				/>
			</div>
			{target ? createPortal(menu, target) : menu}
		</div>
	)
}

// vim: ts=4
