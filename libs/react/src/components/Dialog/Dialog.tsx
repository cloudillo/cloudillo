// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'
import { atom, useAtom } from 'jotai'
import Markdown from 'react-markdown'

import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'
import type { Elevation } from '../types.js'

import { LuX as IcClose } from 'react-icons/lu'

/* Dialog component for HTML5 dialog */
/*************************************/
export interface DialogProps {
	className?: string
	open?: boolean
	title?: string
	elevation?: Elevation
	onClose?: () => void
	children: React.ReactNode
}

export function Dialog({
	className,
	open,
	title,
	elevation = 'high',
	onClose,
	children
}: DialogProps) {
	if (!open) return null

	return (
		<div className="c-modal show" tabIndex={-1}>
			<div className={mergeClasses('c-dialog c-panel emph p-3', elevation, className)}>
				<div className="c-hbox mb-2">
					<h2 className="fill">{title}</h2>
					<button type="button" className="c-link" aria-label="Close" onClick={onClose}>
						<IcClose />
					</button>
				</div>
				{children}
			</div>
		</div>
	)
}

/* useDialog() hook */
/********************/
type DialogType = 'Tell' | 'OkCancel' | 'YesNo' | 'Text'

interface DialogState {
	type: DialogType
	title: string
	descr: string
	className?: string
	placeholder?: string
	defaultValue?: string
	multiline?: boolean
}

const dialogAtom = atom<DialogState | undefined>()

let dialogResolve: (value?: unknown) => void

export function DialogContainer() {
	const { t } = useLibTranslation()
	const [dialog, setDialog] = useAtom(dialogAtom)
	const [value, setValue] = React.useState('')

	function onButtonClick(value: unknown) {
		setDialog(undefined)
		dialogResolve?.(value)
	}

	function onCancel() {
		setDialog(undefined)
		dialogResolve?.(undefined)
	}

	return (
		<>
			{dialog && (
				<div
					className={mergeClasses('c-modal', dialog.className, dialog && 'show')}
					tabIndex={-1}
				>
					{dialog && (
						<div className="c-dialog c-panel h-max-100 emph p-4">
							<div className="c-hbox">
								<h2 className="fill mb-3">{dialog.title}</h2>
								<button
									type="button"
									className="c-link pos-absolute top-0 right-0 m-3"
									data-bs-dismiss="modal"
									aria-label="Close"
									onClick={onCancel}
								>
									<IcClose />
								</button>
							</div>
							<div className="c-markdown overflow-y-auto">
								<Markdown>{dialog.descr}</Markdown>
							</div>
							{
								// dialog.descr.split(/\n\n\s*/).map((p, i) => <p key={i} className="mb-2">{p}</p>)
							}

							{dialog.type == 'Tell' && (
								<div className="c-group g-2 mt-4">
									<Button primary autoFocus onClick={() => onButtonClick(true)}>
										{t('OK')}
									</Button>
								</div>
							)}
							{dialog.type == 'OkCancel' && (
								<div className="c-group g-2 mt-4">
									<Button primary autoFocus onClick={() => onButtonClick(true)}>
										{t('OK')}
									</Button>
									<Button onClick={onCancel}>{t('Cancel')}</Button>
								</div>
							)}
							{dialog.type == 'YesNo' && (
								<div className="c-group g-2 mt-4">
									<Button primary onClick={() => onButtonClick(true)}>
										{t('Yes')}
									</Button>
									<Button onClick={() => onButtonClick(false)}>{t('No')}</Button>
								</div>
							)}
							{dialog.type == 'Text' && (
								<>
									<form
										onSubmit={(e) => {
											e.preventDefault()
											onButtonClick(value)
										}}
									>
										{!dialog.multiline ? (
											<input
												className="c-input mt-3"
												type="text"
												placeholder={dialog.placeholder}
												defaultValue={dialog.defaultValue}
												autoFocus
												onChange={(e) => setValue(e.target.value)}
											/>
										) : (
											<textarea
												className="c-input mt-3"
												placeholder={dialog.placeholder}
												defaultValue={dialog.defaultValue}
												autoFocus
												onChange={(e) => setValue(e.target.value)}
											/>
										)}
									</form>
									<div className="c-group g-2 mt-4">
										<Button primary onClick={() => onButtonClick(value)}>
											{t('OK')}
										</Button>
										<Button onClick={onCancel}>{t('Cancel')}</Button>
									</div>
								</>
							)}
						</div>
					)}
				</div>
			)}
		</>
	)
}

export interface UseDialogReturn {
	isOpen: boolean
	tell: (title: string, descr: string, className?: string) => Promise<void>
	confirm: (title: string, descr: string, className?: string) => Promise<boolean>
	ask: (title: string, descr: string, className?: string) => Promise<boolean>
	askText: (
		title: string,
		descr: string,
		opts?: {
			className?: string
			placeholder?: string
			defaultValue?: string
			multiline?: boolean
		}
	) => Promise<string | undefined>
}

export function useDialog(): UseDialogReturn {
	const [dialog, setDialog] = useAtom(dialogAtom)

	function ret() {
		return new Promise(function (resolve) {
			// Resolve previous dialog if still pending (prevents hanging promises)
			if (dialogResolve) dialogResolve(undefined)
			dialogResolve = resolve
		})
	}

	function tell(
		title: string,
		descr: string,
		className: string | undefined = undefined
	): Promise<void> {
		setDialog({ type: 'Tell', title, descr, className })
		return ret() as Promise<void>
	}

	function confirm(
		title: string,
		descr: string,
		className: string | undefined = undefined
	): Promise<boolean> {
		setDialog({ type: 'OkCancel', title, descr, className })
		return ret() as Promise<boolean>
	}

	function ask(
		title: string,
		descr: string,
		className: string | undefined = undefined
	): Promise<boolean> {
		setDialog({ type: 'YesNo', title, descr, className })
		return ret() as Promise<boolean>
	}

	function askText(
		title: string,
		descr: string,
		{
			className,
			placeholder,
			defaultValue,
			multiline
		}: {
			className?: string
			placeholder?: string
			defaultValue?: string
			multiline?: boolean
		} = {}
	): Promise<string | undefined> {
		setDialog({ type: 'Text', title, descr, className, placeholder, defaultValue, multiline })
		return ret() as Promise<string | undefined>
	}

	return {
		isOpen: !!dialog,
		tell,
		confirm,
		ask,
		askText
	}
}

// vim: ts=4
