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

import React from 'react'
import { atom, useAtom } from 'jotai'
import { useTranslation, Trans } from 'react-i18next'

/////////////////
// useDialog() //
/////////////////
enum DialogType {
	Simple,
	OkCancel,
	YesNo
}

interface DialogState {
	type: DialogType
	className?: string
	title: string
	descr: string
}

const dialogAtom = atom<DialogState | undefined>(undefined)
let dialogResolve: (value?: any) => void

export function Dialog() {
	const { t } = useTranslation()
	const [dialog, setDialog] = useAtom(dialogAtom)

	function onButtonClick(value: any) {
		setDialog(undefined)
		dialogResolve && dialogResolve(value)
	}

	function onCancel() {
		setDialog(undefined)
		dialogResolve && dialogResolve(undefined)
	}

	return <>
		{dialog && <div className={'modal ' + (dialog.className || '')} style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }} tabIndex={-1} onClick={() => onButtonClick(false)}>
			{dialog && <div className="modal-dialog modal-dialog-centered">
				<div className="modal-content">
					<div className="modal-header">
						<h5 className="modal-title">{dialog.title}</h5>
						<button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" onClick={onCancel}/>
					</div>
					<div className="modal-body">
						<p>{dialog.descr}</p>
					</div>
					<div className="modal-footer">
						{ dialog.type == DialogType.Simple && <>
							<button type="button" className="btn btn-primary" onClick={() => onButtonClick(true)}>{t('OK')}</button>
						</>}
						{ dialog.type == DialogType.OkCancel && <>
							<button type="button" className="btn btn-primary" onClick={() => onButtonClick(true)}>{t('OK')}</button>
							<button type="button" className="btn btn-secondary" onClick={onCancel}>{t('Cancel')}</button>
						</>}
						{ dialog.type == DialogType.YesNo && <>
							<button type="button" className="btn btn-primary" onClick={() => onButtonClick(true)}>{t('Yes')}</button>
							<button type="button" className="btn btn-secondary" onClick={() => onButtonClick(false)}>{t('No')}</button>
						</>}
					</div>
				</div>
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

	function simple(title: string, descr: string, className: string | undefined = undefined) {
		setDialog({ type: DialogType.Simple, className, title, descr })
		return ret()
	}

	function confirm(title: string, descr: string, className: string | undefined = undefined) {
		setDialog({ type: DialogType.OkCancel, className, title, descr })
		return ret()
	}

	function ask(title: string, descr: string, className: string | undefined = undefined) {
		setDialog({ type: DialogType.YesNo, className, title, descr })
		return ret()
	}

	return {
		simple,
		confirm,
		ask
	}
}

//////////
// Page //
//////////
interface PageProps {
	title?: string
	noBackButton?: boolean
	actions?: React.ReactNode
	children: React.ReactNode
}

export function Page({ title, noBackButton, actions, children }: PageProps) {
	return <div>
		{title && <h2>{title}</h2>}
		{children}
	</div>
}

// vim: ts=4
