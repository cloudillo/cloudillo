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

import { useAuth, useApi, Button } from '@cloudillo/react'

import { addWebAuthn, deleteWebAuthn } from '../auth/auth.js'
import { useSettings } from './settings.js'

export function SecuritySettings() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const api = useApi()
	const [credential, setCredential] = React.useState(localStorage.getItem('credential'))
	const { settings, onSettingChange } = useSettings('sec')
	const [currentPassword, setCurrentPassword] = React.useState('')
	const [newPassword, setNewPassword] = React.useState('')

	async function onWebauthnChange(evt: React.ChangeEvent<HTMLInputElement>) {
		if (!auth?.idTag) return

		console.log('onWebauthnChange', evt.target.checked)
		if (evt.target.checked) {
			const reg = await addWebAuthn(api, auth.idTag, auth.name || auth.idTag)
			console.log('reg', reg)
			setCredential(reg.id)
		} else {
			await deleteWebAuthn(api)
			setCredential(null)
		}
	}

	async function onChangePassword() {
		await api.post('', '/auth/password', { data: { currentPassword, newPassword }})
		setCurrentPassword('')
		setNewPassword('')
	}

	if (!settings) return null

	return <>
		<div className="c-panel">
			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Passwordless login')}</span>
				<input className="c-toggle primary" name="sec.webauthn" type="checkbox" checked={!!credential} onChange={onWebauthnChange}/>
			</label>
		</div>
		<div className="c-panel">
			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Current password')}</span>
				<input className="c-input" name="sec.current_password" type="password" onChange={evt => setCurrentPassword(evt.target.value)}/>
			</label>
			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('New password')}</span>
				<input className="c-input" name="sec.new_password" type="password" onChange={evt => setNewPassword(evt.target.value)}/>
			</label>
			<div className="c-group">
				<Button primary disabled={!currentPassword || !newPassword} onClick={onChangePassword}>{t('Change password')}</Button>
			</div>
		</div>
	</>
}

// vim: ts=4
