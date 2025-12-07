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
import QRCode from 'react-qr-code'

import { useApi, useAuth, useDialog, Button, Dialog } from '@cloudillo/react'

import {
	LuCheck as IcAvailable,
	LuX as IcUnavailable,
	LuPlus as IcAdd,
	LuCopy as IcCopy,
	LuTrash as IcDelete,
	LuQrCode as IcQrCode
} from 'react-icons/lu'

interface Ref {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt: Date
	count: number
}

function Invitation({ ref, deleteRef }: { ref: Ref; deleteRef: () => void }) {
	const [qrCode, setQrCode] = React.useState<string | undefined>()
	const url = `https://${location.host}/register/${ref.refId}`

	function copyUrlToClipboard() {
		navigator.clipboard.writeText(url)
	}

	function showQrCode() {
		setQrCode(url)
	}

	return (
		<div className="c-panel">
			<div className="c-hbox">
				<h2 className="fill">{ref.description || ''}</h2>
				<div className="c-hbox g-3">
					<Button link onClick={() => copyUrlToClipboard()}>
						<IcCopy />
					</Button>
					<Button link onClick={() => showQrCode()}>
						<IcQrCode />
					</Button>
					<Button link onClick={() => deleteRef()}>
						<IcDelete />
					</Button>
				</div>
			</div>
			<div className="c-hbox">
				<div className="fill">{ref.createdAt.toLocaleString()}</div>
				<div>
					{ref.count && (!ref.expiresAt || ref.expiresAt > new Date()) ? (
						<div className="c-hbox text-success g-0">
							<IcAvailable />
							{ref.count > 1 && <span>{ref.count}</span>}
						</div>
					) : (
						<IcUnavailable className="text-warning" />
					)}
				</div>
			</div>

			{qrCode && (
				<Dialog open onClose={() => setQrCode(undefined)}>
					<QRCode
						value={qrCode}
						className="p-4 h-auto mx-auto"
						style={{ background: '#fff', width: '100%', maxWidth: 'min(100%,50vh)' }}
					/>
				</Dialog>
			)}
		</div>
	)
}

export function Invitations() {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [refs, setRefs] = React.useState<Ref[] | undefined>()

	React.useEffect(
		function loadRefs() {
			if (!auth || !api) return
			;(async function () {
				const res = await api.refs.list({ type: 'register' })
				console.log('RES', res)
				if (Array.isArray(res))
					setRefs(res.map((ref: any) => ({ ...ref, createdAt: new Date(ref.createdAt) })))
			})()
		},
		[auth, api]
	)

	async function createRef() {
		if (!api) return
		const description = await dialog.askText(
			t('Create invitation'),
			t('You can write a short description to help you distinguish the invitations later.')
		)

		const res = await api.refs.create({ type: 'register', description: description as string })
		console.log('REF RES', res)
		if (res) {
			setRefs((refs) => [
				{ ...res, createdAt: new Date(res.createdAt) } as any,
				...(refs || [])
			])
		}
	}

	async function deleteRef(refId: string) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Delete invitation'),
				t('Are you sure you want to delete this invitation?')
			))
		)
			return

		await api.refs.delete(refId)
		setRefs((refs) => refs?.filter((ref) => ref.refId !== refId))
		console.log(
			'DELETE',
			refId,
			refs,
			refs?.filter((ref) => ref.refId !== refId)
		)
	}

	return (
		<>
			<div className="c-vbox">
				{refs &&
					refs.map((ref) => (
						<Invitation
							key={ref.refId}
							ref={ref}
							deleteRef={() => deleteRef(ref.refId)}
						/>
					))}
			</div>
			<button className="c-button primary float mb-5 me-2" onClick={createRef}>
				<IcAdd />
			</button>
		</>
	)
}

// vim: ts=4
