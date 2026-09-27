// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useEditable } from 'use-editable'

import { useFieldControl } from '../Form/Field.js'
import { generateFragments } from '../formatted-text.js'
import { useMergedRefs } from '../hooks.js'
import { createComponent, mergeClasses } from '../utils.js'
import { handleEditablePaste } from './editablePaste.js'

/** Imperative handle for edits at the caret (e.g. an emoji picker). */
export interface RichTextInputHandle {
	/** Inserts `text` at the current selection, replacing it */
	insert: (text: string) => void
}

export interface RichTextInputProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'onSubmit'> {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	/** Trailing slot inside the input group (send button, status…) */
	actions?: React.ReactNode
	/** Called on the submit key */
	onSubmit?: () => void
	/** `enter`: Enter submits, Shift+Enter breaks the line. Default `ctrl+enter`. */
	submitKey?: 'enter' | 'ctrl+enter'
	disabled?: boolean
	/** Minimum height in lines */
	minRows?: number
	autoFocus?: boolean
	required?: boolean
	/** Receives the insert handle; the component ref stays the editable element */
	editRef?: React.Ref<RichTextInputHandle>
}

/**
 * contentEditable composer: `use-editable` with link/hashtag/emoji highlighting and
 * the empty-editor paste fix. The ref is the editable element.
 */
export const RichTextInput = createComponent<HTMLDivElement, RichTextInputProps>(
	'RichTextInput',
	(
		{
			value,
			onChange,
			placeholder,
			actions,
			onSubmit,
			submitKey = 'ctrl+enter',
			disabled,
			minRows,
			autoFocus,
			className,
			style,
			onKeyDown,
			editRef,
			required: _required,
			...props
		},
		ref
	) => {
		const editorRef = React.useRef<HTMLDivElement>(null)
		const field = useFieldControl({ ...props, required: _required }, ref, 'RichTextInput')
		const mergedRef = useMergedRefs(field.ref, editorRef)
		const edit = useEditable(editorRef, (text) => onChange(text), { disabled })
		React.useImperativeHandle(editRef, () => ({ insert: (text) => edit.insert(text) }), [edit])

		React.useEffect(() => {
			if (!autoFocus) return
			// A freshly mounted contentEditable can land with a detached selection; a
			// blur/focus round-trip one frame later restores a working caret.
			const timer = setTimeout(() => {
				editorRef.current?.blur()
				editorRef.current?.focus()
			}, 0)
			return () => clearTimeout(timer)
		}, [autoFocus])

		function handleKeyDown(evt: React.KeyboardEvent<HTMLDivElement>) {
			onKeyDown?.(evt)
			if (evt.defaultPrevented || evt.key !== 'Enter' || !onSubmit) return
			const submit = submitKey === 'enter' ? !evt.shiftKey : evt.ctrlKey
			if (submit) {
				evt.preventDefault()
				onSubmit()
			}
		}

		const empty = !value.trim()
		// A div has no `required`; expose it the ARIA way
		const { required, ...controlProps } = field.controlProps

		return (
			<div className={mergeClasses('c-input-group', className)} style={style}>
				<div
					{...props}
					{...controlProps}
					aria-required={required}
					ref={mergedRef}
					className={mergeClasses('c-input', 'rich-text', 'flex-fill')}
					style={minRows ? { minHeight: `${minRows}lh` } : undefined}
					role="textbox"
					aria-multiline
					aria-placeholder={placeholder}
					aria-disabled={disabled || undefined}
					tabIndex={disabled ? -1 : 0}
					data-placeholder={empty ? placeholder : undefined}
					onKeyDown={handleKeyDown}
					onPasteCapture={(evt) => handleEditablePaste(evt, edit, value)}
				>
					{generateFragments(value).map((n, i) => (
						<React.Fragment key={i}>{n}</React.Fragment>
					))}
				</div>
				{actions != null && <div className="c-rich-text-actions">{actions}</div>}
			</div>
		)
	}
)

// vim: ts=4
