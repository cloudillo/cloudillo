// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuCheck as IcSave, LuX as IcCancel } from 'react-icons/lu'
import { mergeClasses, createComponent } from '../utils.js'

export interface InlineEditFormProps
	extends Omit<React.HTMLAttributes<HTMLFormElement>, 'onSubmit'> {
	value: string
	onSave: (value: string) => void
	onCancel: () => void
	placeholder?: string
	autoFocus?: boolean
	selectOnFocus?: boolean
	size?: 'small' | 'default'
	saveIcon?: React.ReactNode
	cancelIcon?: React.ReactNode
	inputClassName?: string
}

export const InlineEditForm = createComponent<HTMLFormElement, InlineEditFormProps>(
	'InlineEditForm',
	(
		{
			className,
			value,
			onSave,
			onCancel,
			placeholder,
			autoFocus = true,
			selectOnFocus = true,
			size,
			saveIcon = <IcSave />,
			cancelIcon = <IcCancel />,
			inputClassName,
			...props
		},
		ref
	) => {
		const [editValue, setEditValue] = React.useState(value)
		const inputRef = React.useRef<HTMLInputElement>(null)

		React.useEffect(() => {
			if (autoFocus && inputRef.current) {
				inputRef.current.focus()
				if (selectOnFocus) {
					inputRef.current.select()
				}
			}
		}, [autoFocus, selectOnFocus])

		const handleSubmit = React.useCallback(
			(evt: React.FormEvent) => {
				evt.preventDefault()
				evt.stopPropagation()
				if (editValue.trim()) {
					onSave(editValue.trim())
				}
			},
			[editValue, onSave]
		)

		const handleCancel = React.useCallback(
			(evt: React.MouseEvent) => {
				evt.preventDefault()
				evt.stopPropagation()
				onCancel()
			},
			[onCancel]
		)

		const handleKeyDown = React.useCallback(
			(evt: React.KeyboardEvent) => {
				if (evt.key === 'Escape') {
					evt.preventDefault()
					evt.stopPropagation()
					onCancel()
				}
			},
			[onCancel]
		)

		const handleClick = React.useCallback((evt: React.MouseEvent) => {
			evt.stopPropagation()
		}, [])

		const buttonPadding = size === 'small' ? 'p-1' : 'p-2'

		return (
			<form
				ref={ref}
				className={mergeClasses('c-inline-edit-form', 'c-input-group', className)}
				onSubmit={handleSubmit}
				onClick={handleClick}
				{...props}
			>
				<input
					ref={inputRef}
					className={mergeClasses('c-input', inputClassName)}
					type="text"
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
				/>
				<button
					className={mergeClasses('c-button', 'primary', buttonPadding)}
					type="submit"
					disabled={!editValue.trim()}
				>
					{saveIcon}
				</button>
				<button
					className={mergeClasses('c-button', 'secondary', buttonPadding)}
					type="button"
					onClick={handleCancel}
				>
					{cancelIcon}
				</button>
			</form>
		)
	}
)

// vim: ts=4
