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
import { useTranslation } from 'react-i18next'
import { atom, useAtom } from 'jotai'

import { Button, mergeClasses } from './components.js'

import {
	LuX as IcClose,
	LuCheck as IcOk,
	LuX as IcCancel
} from 'react-icons/lu'

/* Dialog component for HTML5 dialog */
/*************************************/
interface DialogProps {
	className?: string
	open?: boolean
	children: React.ReactNode
}

export function Dialog({ className, open, children }: DialogProps) {
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

	return <dialog ref={ref} className={className}>
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
}

const dialogAtom = atom<DialogState | undefined>()

let dialogResolve: (value?: unknown) => void

export function DialogContainer() {
	const { t } = useTranslation()
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
			{dialog && <div className="c-panel emph p-4">
				<div className="c-hbox">
					<h2 className="fill">{dialog.title}</h2>
					<button type="button" className="c-link" data-bs-dismiss="modal" aria-label="Close" onClick={onCancel}><IcClose/></button>
				</div>
				<p className="mt-4">{dialog.descr}</p>

				{ dialog.type == 'Tell' && <div className="c-group g-2 mt-4">
						<Button primary onClick={() => onButtonClick(true)}>{t('OK')}</Button>
				</div>}
				{ dialog.type == 'OkCancel' && <div className="c-group g-2 mt-4">
						<Button primary onClick={() => onButtonClick(true)}>{t('OK')}</Button>
						<Button onClick={onCancel}>{t('Cancel')}</Button>
				</div>}
				{ dialog.type == 'YesNo' && <div className="c-group g-2 mt-4">
						<Button primary onClick={() => onButtonClick(true)}>{t('Yes')}</Button>
						<Button onClick={() => onButtonClick(false)}>{t('No')}</Button>
				</div>}
				{ dialog.type == 'Text' && <>
					<form onSubmit={e => { e.preventDefault(); onButtonClick(value) }}>
						<input className="c-input mt-3" type="text" placeholder={dialog.placeholder} defaultValue={dialog.defaultValue} autoFocus onChange={e => setValue(e.target.value)}/>
					</form>
					<div className="c-group g-2 mt-4">
						<Button primary onClick={() => onButtonClick(true)}>{t('OK')}</Button>
						<Button onClick={onCancel}>{t('Cancel')}</Button>
					</div>
				</>}
			</div>}
		</div>}
	</>
}

export function useDialog() {
	const [_, setDialog] = useAtom(dialogAtom)

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

	function askText(title: string, descr: string, { className, placeholder, defaultValue }: {
		className?: string
		placeholder?: string
		defaultValue?: string
	} = {}) {
		setDialog({ type: 'Text', title, descr, className, placeholder, defaultValue })
		console.log('askText', { title, descr, className, placeholder, defaultValue })
		return ret()
	}

	/*
	function askText(title: string, descr: string, opts: {
		className?: string
		placeholder?: string
		defaultValue?: string
	} = {}) {
		setDialog({ type: 'Text', title, descr })
		console.log('askText', opts, { title, descr })
		return ret()
	}
	*/

	return {
		tell,
		confirm,
		ask,
		askText
	}
}

// vim: ts=4
