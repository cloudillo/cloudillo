// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { IcCancel, IcConfirm } from '../../icons.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface InlineEditFormProps
	extends Omit<React.HTMLAttributes<HTMLFormElement>, 'onSubmit'> {
	value: string
	/** Gets a changed, non-empty, trimmed value, on submit. */
	onSave: (value: string) => void
	/** Esc and the cancel button, and a submit with an unchanged value. */
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
			saveIcon = <IcConfirm />,
			cancelIcon = <IcCancel />,
			inputClassName,
			onKeyDown,
			onClick,
			onDoubleClick,
			...props
		},
		ref
	) => {
		const { t } = useLibTranslation()
		const [editValue, setEditValue] = React.useState(value)
		const inputRef = React.useRef<HTMLInputElement>(null)

		// As opened, like `editValue`: a remote rename must not read as an edit, or Enter
		// on the untouched field would write the old name back.
		const startValue = React.useRef(value)

		const trimmed = editValue.trim()
		const unchanged = trimmed === startValue.current.trim()

		React.useEffect(() => {
			if (autoFocus && inputRef.current) {
				inputRef.current.focus()
				if (selectOnFocus) {
					inputRef.current.select()
				}
			}
		}, [autoFocus, selectOnFocus])

		function cancel(evt: React.SyntheticEvent) {
			evt.preventDefault()
			evt.stopPropagation()
			onCancel()
		}

		function handleSubmit(evt: React.FormEvent) {
			evt.preventDefault()
			evt.stopPropagation()
			if (!trimmed) return
			if (unchanged) onCancel()
			else onSave(trimmed)
		}

		function handleKeyDown(evt: React.KeyboardEvent<HTMLFormElement>) {
			onKeyDown?.(evt)
			if (evt.key === 'Escape') cancel(evt)
		}

		function handleClick(evt: React.MouseEvent<HTMLFormElement>) {
			onClick?.(evt)
			evt.stopPropagation()
		}

		function handleDoubleClick(evt: React.MouseEvent<HTMLFormElement>) {
			onDoubleClick?.(evt)
			evt.stopPropagation()
		}

		return (
			<form
				{...props}
				ref={ref}
				className={mergeClasses('c-inline-edit-form', size === 'small' && 'sm', className)}
				onSubmit={handleSubmit}
				onKeyDown={handleKeyDown}
				onClick={handleClick}
				onDoubleClick={handleDoubleClick}
			>
				<input
					ref={inputRef}
					className={mergeClasses('c-inline-edit-input', inputClassName)}
					type="text"
					// Sizes the field to its text where the CSS lets it, as in the DocBar
					size={Math.max(editValue.length, 12)}
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					placeholder={placeholder}
				/>
				<button
					className="c-button ghost sm icon primary"
					type="submit"
					disabled={!trimmed}
					aria-label={t('OK')}
				>
					{saveIcon}
				</button>
				<button
					className="c-button ghost sm icon"
					type="button"
					onClick={cancel}
					aria-label={t('Cancel')}
				>
					{cancelIcon}
				</button>
			</form>
		)
	}
)

// vim: ts=4
