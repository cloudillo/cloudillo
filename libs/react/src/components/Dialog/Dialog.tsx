// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'
import { atom, useAtom } from 'jotai'
import Markdown from 'react-markdown'

import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'

import {
	LuX as IcClose,
	LuCheck as IcOk,
	LuX as IcCancel
} from 'react-icons/lu'

/* Dialog component for HTML5 dialog */
/*************************************/
export interface DialogProps {
	className?: string
	open?: boolean
	title?: string
	onClose?: () => void
	children: React.ReactNode
}

export function Dialog({ className, open, title, onClose, children }: DialogProps) {
	const ref = React.useRef<HTMLDialogElement>(null)

	React.useEffect(function () {
		if (ref.current) {
			if (open) {
				ref.current.showModal()
			} else {
				ref.current.close()
			}
		}
	}, [open])

	return <dialog ref={ref} className={className || 'c-dialog c-panel emph p-3'}>
		<div className="c-hbox mb-2">
			<h2 className="fill">{title}</h2>
			<button type="button" className="c-link" data-bs-dismiss="modal" aria-label="Close" onClick={onClose}><IcClose/></button>
		</div>
		{children}
	</dialog>
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
		dialogResolve && dialogResolve(value)
	}

	function onCancel() {
		setDialog(undefined)
		dialogResolve && dialogResolve(undefined)
	}

	return <>
		{dialog && <div className={mergeClasses('c-modal', dialog.className, dialog && 'show')} tabIndex={-1}>
			{dialog && <div className="c-dialog c-panel h-max-100 emph p-4">
				<div className="c-hbox">
					<h2 className="fill mb-3">{dialog.title}</h2>
					<button type="button" className="c-link pos-absolute top-0 right-0 m-3" data-bs-dismiss="modal" aria-label="Close" onClick={onCancel}><IcClose/></button>
				</div>
				<div className="c-markdown overflow-y-auto">
					<Markdown>{dialog.descr}</Markdown>
				</div>
				{// dialog.descr.split(/\n\n\s*/).map((p, i) => <p key={i} className="mb-2">{p}</p>)
				}

				{ dialog.type == 'Tell' && <div className="c-group g-2 mt-4">
						<Button primary autoFocus onClick={() => onButtonClick(true)}>{t('OK')}</Button>
				</div>}
				{ dialog.type == 'OkCancel' && <div className="c-group g-2 mt-4">
						<Button primary autoFocus onClick={() => onButtonClick(true)}>{t('OK')}</Button>
						<Button onClick={onCancel}>{t('Cancel')}</Button>
				</div>}
				{ dialog.type == 'YesNo' && <div className="c-group g-2 mt-4">
						<Button primary onClick={() => onButtonClick(true)}>{t('Yes')}</Button>
						<Button onClick={() => onButtonClick(false)}>{t('No')}</Button>
				</div>}
				{ dialog.type == 'Text' && <>
					<form onSubmit={e => { e.preventDefault(); onButtonClick(value) }}>
						{ !dialog.multiline
							? <input className="c-input mt-3" type="text" placeholder={dialog.placeholder} defaultValue={dialog.defaultValue} autoFocus onChange={e => setValue(e.target.value)}/>
							: <textarea className="c-input mt-3" placeholder={dialog.placeholder} defaultValue={dialog.defaultValue} autoFocus onChange={e => setValue(e.target.value)}/>
						}
					</form>
					<div className="c-group g-2 mt-4">
						<Button primary onClick={() => onButtonClick(value)}>{t('OK')}</Button>
						<Button onClick={onCancel}>{t('Cancel')}</Button>
					</div>
				</>}
			</div>}
		</div>}
	</>
}

export interface UseDialogReturn {
	isOpen: boolean
	tell: (title: string, descr: string, className?: string) => Promise<unknown>
	confirm: (title: string, descr: string, className?: string) => Promise<unknown>
	ask: (title: string, descr: string, className?: string) => Promise<unknown>
	askText: (title: string, descr: string, opts?: {
		className?: string
		placeholder?: string
		defaultValue?: string
		multiline?: boolean
	}) => Promise<unknown>
}

export function useDialog(): UseDialogReturn {
	const [dialog, setDialog] = useAtom(dialogAtom)

	function ret() {
		return new Promise(function (resolve) {
			dialogResolve = resolve
		})
	}

	function tell(title: string, descr: string, className: string | undefined = undefined) {
		setDialog({ type: 'Tell', title, descr, className })
		return ret()
	}

	function confirm(title: string, descr: string, className: string | undefined = undefined) {
		setDialog({ type: 'OkCancel', title, descr, className })
		return ret()
	}

	function ask(title: string, descr: string, className: string | undefined = undefined) {
		setDialog({ type: 'YesNo', title, descr, className })
		return ret()
	}

	function askText(title: string, descr: string, { className, placeholder, defaultValue, multiline }: {
		className?: string
		placeholder?: string
		defaultValue?: string
		multiline?: boolean
	} = {}) {
		setDialog({ type: 'Text', title, descr, className, placeholder, defaultValue, multiline })
		console.log('askText', { title, descr, className, placeholder, defaultValue, multiline })
		return ret()
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
