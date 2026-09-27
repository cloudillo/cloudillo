// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useAtom } from 'jotai'
import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'
import Markdown from 'react-markdown'

import { useLibTranslation } from '../../i18n.js'
import { ActionBar } from '../ActionBar/ActionBar.js'
import { Button } from '../Button/Button.js'
import { Field } from '../Form/Field.js'
import { Input } from '../Form/Input.js'
import { TextArea } from '../Form/TextArea.js'
import { Modal } from '../Modal/Modal.js'
import type { ColorVariant, Elevation } from '../types.js'
import { mergeClasses } from '../utils.js'

/* Dialog component on the native <dialog> */
/*************************************************/
export interface DialogProps {
	className?: string
	open?: boolean
	/** Rendered as the h2 heading and the dialog's accessible name. */
	title?: React.ReactNode
	/** Short text under the title; the dialog's accessible description. */
	description?: React.ReactNode
	/** Leading icon of the title row. */
	icon?: React.ReactNode
	/** Width. Unset keeps the default panel width. */
	size?: 'sm' | 'md' | 'lg' | 'full'
	/** Pinned under the scrolling body, usually an `<ActionBar>`. */
	footer?: React.ReactNode
	elevation?: Elevation
	onClose?: () => void
	/**
	 * Escape, a backdrop click and the close button close the dialog (default).
	 * `false` = blocking: the user has to pick one of the footer actions.
	 */
	dismissable?: boolean
	/** Form mode: the panel is a `<form>`, Enter or a `type="submit"` button submits. */
	onSubmit?: (evt: React.FormEvent<HTMLFormElement>) => void
	children?: React.ReactNode
}

export function Dialog({
	className,
	open,
	title,
	description,
	icon,
	size,
	footer,
	elevation = 'high',
	onClose,
	dismissable = true,
	onSubmit,
	children
}: DialogProps) {
	const { t } = useLibTranslation()
	const titleId = React.useId()
	const descrId = React.useId()
	const closable = dismissable && !!onClose

	const panelProps = {
		className: mergeClasses('c-dialog c-panel emph p-3', elevation, size, className)
	}
	const content = (
		<>
			{(title || icon || closable) && (
				<div className="c-dialog-header">
					{icon}
					<h2 id={titleId} className="fill">
						{title}
					</h2>
					{closable && (
						<Button
							variant="ghost"
							size="sm"
							icon={<IcClose />}
							aria-label={t('Close')}
							onClick={onClose}
						/>
					)}
				</div>
			)}
			<div className="c-dialog-body">
				{description && (
					<p id={descrId} className="c-dialog-description">
						{description}
					</p>
				)}
				{children}
			</div>
			{footer && <div className="c-dialog-footer">{footer}</div>}
		</>
	)

	return (
		<Modal
			open={open}
			onClose={closable ? onClose : undefined}
			closeOnBackdrop={closable}
			aria-labelledby={title ? titleId : undefined}
			aria-describedby={description ? descrId : undefined}
		>
			{onSubmit ? (
				<form
					{...panelProps}
					onSubmit={(evt) => {
						evt.preventDefault()
						onSubmit(evt)
					}}
				>
					{content}
				</form>
			) : (
				<div {...panelProps}>{content}</div>
			)}
		</Modal>
	)
}

/* useDialog() hook */
/********************/
export interface DialogOptions {
	/** Confirm button colour; `error` for destructive actions. Default `primary`. */
	color?: ColorVariant
	/** Confirm button label, named after the action ("Delete"), never "OK" for destructive ones. */
	confirmLabel?: string
	cancelLabel?: string
	/** Typed-phrase confirm for irreversible actions: confirm stays disabled until typed. */
	requireText?: string
	/** @deprecated Use `color`. Extra class on the dialog panel. */
	className?: string
}

export interface AskTextOptions extends DialogOptions {
	placeholder?: string
	defaultValue?: string
	multiline?: boolean
}

type DialogType = 'Tell' | 'OkCancel' | 'YesNo' | 'Text'

interface DialogState extends AskTextOptions {
	type: DialogType
	title: string
	descr: string
}

const dialogAtom = atom<DialogState | undefined>()

let dialogResolve: (value?: unknown) => void

export function DialogContainer() {
	const { t } = useLibTranslation()
	const [dialog, setDialog] = useAtom(dialogAtom)
	const [value, setValue] = React.useState('')
	const [phrase, setPhrase] = React.useState('')

	React.useEffect(() => {
		setValue(dialog?.defaultValue ?? '')
		setPhrase('')
	}, [dialog])

	function onButtonClick(value: unknown) {
		setDialog(undefined)
		dialogResolve?.(value)
	}

	function onCancel() {
		setDialog(undefined)
		dialogResolve?.(undefined)
	}

	if (!dialog) return null

	const { type, requireText } = dialog
	const canConfirm = !requireText || phrase === requireText
	const destructive = dialog.color === 'error'
	const defaultLabels = {
		Tell: [t('OK'), undefined],
		OkCancel: [t('OK'), t('Cancel')],
		YesNo: [t('Yes'), t('No')],
		Text: [t('OK'), t('Cancel')]
	}[type]
	const confirmLabel = dialog.confirmLabel ?? defaultLabels[0]
	const cancelLabel = defaultLabels[1] && (dialog.cancelLabel ?? defaultLabels[1])

	return (
		<Dialog
			open
			className={dialog.className}
			title={dialog.title}
			onClose={onCancel}
			onSubmit={() => {
				if (canConfirm) onButtonClick(type === 'Text' ? value : true)
			}}
			footer={
				<ActionBar>
					{cancelLabel && (
						<Button
							autoFocus={destructive && !requireText}
							onClick={type === 'YesNo' ? () => onButtonClick(false) : onCancel}
						>
							{cancelLabel}
						</Button>
					)}
					<Button
						type="submit"
						color={dialog.color ?? 'primary'}
						autoFocus={type !== 'Text' && !destructive && !requireText}
						disabled={!canConfirm}
					>
						{confirmLabel}
					</Button>
				</ActionBar>
			}
		>
			<div className="c-markdown">
				<Markdown>{dialog.descr}</Markdown>
			</div>
			{type === 'Text' &&
				(dialog.multiline ? (
					<TextArea
						placeholder={dialog.placeholder}
						value={value}
						autoFocus
						onChange={(e) => setValue(e.target.value)}
					/>
				) : (
					<Input
						type="text"
						placeholder={dialog.placeholder}
						value={value}
						autoFocus
						onChange={(e) => setValue(e.target.value)}
					/>
				))}
			{requireText && (
				<Field label={t('Type {{phrase}} to confirm', { phrase: requireText })}>
					<Input
						type="text"
						value={phrase}
						placeholder={requireText}
						autoComplete="off"
						spellCheck={false}
						autoFocus={type !== 'Text'}
						onChange={(e) => setPhrase(e.target.value)}
					/>
				</Field>
			)}
		</Dialog>
	)
}

/** A string is the deprecated `className` argument. */
type DialogOptionsArg = DialogOptions | string

function toOptions(opts: DialogOptionsArg | undefined): DialogOptions {
	return typeof opts === 'string' ? { className: opts } : (opts ?? {})
}

export interface UseDialogReturn {
	isOpen: boolean
	tell: (title: string, descr: string, opts?: DialogOptionsArg) => Promise<void>
	confirm: (title: string, descr: string, opts?: DialogOptionsArg) => Promise<boolean | undefined>
	ask: (title: string, descr: string, opts?: DialogOptionsArg) => Promise<boolean | undefined>
	askText: (title: string, descr: string, opts?: AskTextOptions) => Promise<string | undefined>
}

export function useDialog(): UseDialogReturn {
	const [dialog, setDialog] = useAtom(dialogAtom)

	function open<T>(state: DialogState): Promise<T> {
		setDialog(state)
		return new Promise(function (resolve) {
			// Resolve previous dialog if still pending (prevents hanging promises)
			if (dialogResolve) dialogResolve(undefined)
			dialogResolve = resolve as (value?: unknown) => void
		})
	}

	return {
		isOpen: !!dialog,
		tell: (title, descr, opts) => open({ ...toOptions(opts), type: 'Tell', title, descr }),
		confirm: (title, descr, opts) =>
			open({ ...toOptions(opts), type: 'OkCancel', title, descr }),
		ask: (title, descr, opts) => open({ ...toOptions(opts), type: 'YesNo', title, descr }),
		askText: (title, descr, opts = {}) => open({ ...opts, type: 'Text', title, descr })
	}
}

// vim: ts=4
