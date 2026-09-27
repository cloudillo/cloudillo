// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose, LuSearch as IcSearch } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { useMergedRefs } from '../hooks.js'
import { Icon } from '../Icon/Icon.js'
import { Kbd } from '../Kbd/Kbd.js'
import { createComponent } from '../utils.js'
import { FieldContext } from './Field.js'
import { Input, type InputProps } from './Input.js'

export interface SearchInputProps extends Omit<InputProps, 'type' | 'leading' | 'trailing'> {
	/** Shortcut hint shown while empty (e.g. "/", "Ctrl K"); hidden on coarse pointers. Display only. */
	shortcut?: React.ReactNode
	/** Called with the query on every edit, delayed by `debounce` ms; clearing fires immediately */
	onSearch?: (query: string) => void
	debounce?: number
}

/** Native value setter, so the clear button emits a React `onChange` for controlled inputs too */
function setNativeValue(input: HTMLInputElement, value: string) {
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
	input.dispatchEvent(new Event('input', { bubbles: true }))
}

export const SearchInput = createComponent<HTMLInputElement, SearchInputProps>(
	'SearchInput',
	({ shortcut, onSearch, debounce, onChange, ...props }, ref) => {
		const { t } = useLibTranslation()
		const field = React.useContext(FieldContext)
		const inputRef = React.useRef<HTMLInputElement>(null)
		const mergedRef = useMergedRefs(ref, inputRef)
		const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
		const [uncontrolled, setUncontrolled] = React.useState(String(props.defaultValue ?? ''))
		const text = props.value !== undefined ? String(props.value) : uncontrolled

		React.useEffect(() => () => clearTimeout(timer.current), [])

		function handleChange(evt: React.ChangeEvent<HTMLInputElement>) {
			const query = evt.target.value
			setUncontrolled(query)
			onChange?.(evt)
			if (!onSearch) return
			clearTimeout(timer.current)
			if (debounce && query) timer.current = setTimeout(() => onSearch(query), debounce)
			else onSearch(query)
		}

		function clear() {
			const input = inputRef.current
			if (!input) return
			setNativeValue(input, '')
			input.focus()
		}

		// A Field's visible label names the input; only a bare SearchInput gets the default
		const named = field || props['aria-label'] || props['aria-labelledby']

		return (
			<Input
				{...props}
				ref={mergedRef}
				type="search"
				aria-label={named ? props['aria-label'] : t('Search')}
				onChange={handleChange}
				leading={<Icon as={IcSearch} />}
				trailing={
					text ? (
						<button
							type="button"
							className="c-search-clear"
							aria-label={t('Clear')}
							onClick={clear}
							disabled={props.disabled || props.readOnly}
						>
							<Icon as={IcClose} />
						</button>
					) : shortcut != null ? (
						<Kbd className="coarse-hide">{shortcut}</Kbd>
					) : undefined
				}
			/>
		)
	}
)

// vim: ts=4
