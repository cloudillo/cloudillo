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
import ReactQRCode from 'react-qr-code'

const QRCode = (ReactQRCode as any).default ?? ReactQRCode

import {
	LuRefreshCw as IcRefresh,
	LuCheck as IcOk,
	LuX as IcError,
	LuQrCode as IcQr
} from 'react-icons/lu'

import { useAuth, AuthState, useApi, Button } from '@cloudillo/react'

import { useLoginInit } from './auth.js'
import { registerServiceWorker, ensureEncryptionKey } from '../pwa.js'

type PanelState = 'loading' | 'showing' | 'approved' | 'denied' | 'expired' | 'error'

export function QrLoginPanel() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth, setAuth] = useAuth()

	const loginInitData = useLoginInit()
	const [state, setState] = React.useState<PanelState>('loading')
	const [sessionId, setSessionId] = React.useState<string>('')
	const [secret, setSecret] = React.useState<string>('')
	const initSession = React.useCallback(async () => {
		if (!api) return
		setState('loading')

		try {
			const result = await api.auth.initQrLogin()
			setSessionId(result.sessionId)
			setSecret(result.secret)
			setState('showing')
		} catch (err) {
			console.error('QR login init failed:', err)
			setState('error')
		}
	}, [api])

	// Use pre-fetched data from login-init context.
	// loginInitData === undefined means "still loading from layout" — wait.
	React.useEffect(
		function initFromContext() {
			if (auth) return

			if (loginInitData) {
				setSessionId(loginInitData.qrLogin.sessionId)
				setSecret(loginInitData.qrLogin.secret)
				setState('showing')
			}
		},
		[auth, loginInitData]
	)

	// Long-poll for status when showing QR
	React.useEffect(
		function pollStatus() {
			if (state !== 'showing' || !api || !sessionId || !secret) return

			let cancelled = false

			const poll = async () => {
				while (!cancelled) {
					try {
						const result = await api.auth.getQrLoginStatus(sessionId, secret)
						if (cancelled) return

						if (
							result.status === 'approved' &&
							result.login?.token &&
							result.login?.tnId &&
							result.login?.idTag &&
							result.login?.name
						) {
							setState('approved')

							// Complete login
							await registerServiceWorker(result.login.token)
							await ensureEncryptionKey()
							setAuth({
								tnId: result.login.tnId,
								idTag: result.login.idTag,
								roles: result.login.roles,
								token: result.login.token,
								name: result.login.name,
								profilePic: result.login.profilePic
							})
							return
						} else if (result.status === 'denied') {
							setState('denied')
							return
						} else if (result.status === 'expired') {
							setState('expired')
							return
						}
						// status === 'pending' → loop continues immediately
					} catch (err) {
						console.error('QR login poll failed:', err)
						if (!cancelled) {
							await new Promise((r) => setTimeout(r, 3000))
						}
					}
				}
			}

			poll()

			return function cleanup() {
				cancelled = true
			}
		},
		[state, api, sessionId, secret]
	)

	if (auth) return null

	const qrValue = `cloudillo:qr-login:${sessionId}`

	return (
		<div className="c-panel p-3" style={{ textAlign: 'center' }}>
			<h3 className="mb-3">
				<IcQr className="me-2" />
				{t('Scan QR code to log in')}
			</h3>

			{state === 'loading' && (
				<div className="p-4">
					<IcRefresh className="animate-rotate-cw" style={{ fontSize: '2rem' }} />
				</div>
			)}

			{state === 'showing' && (
				<>
					<div
						className="p-3 mb-3"
						style={{
							background: 'white',
							display: 'inline-block',
							borderRadius: '8px'
						}}
					>
						<QRCode
							value={qrValue}
							size={200}
							aria-label={t('Scan QR code to log in')}
						/>
					</div>
					<p className="text-muted">
						<IcRefresh
							className="animate-rotate-cw me-1"
							style={{ fontSize: '0.9rem' }}
						/>
						{t('Waiting for approval...')}
					</p>
				</>
			)}

			{state === 'approved' && (
				<div className="p-4">
					<IcOk style={{ fontSize: '3rem', color: 'var(--col-success)' }} />
					<p className="mt-2">{t('Login approved')}</p>
				</div>
			)}

			{state === 'denied' && (
				<div className="p-4">
					<IcError style={{ fontSize: '3rem', color: 'var(--col-error)' }} />
					<p className="mt-2 mb-3">{t('Login denied')}</p>
					<Button onClick={initSession}>{t('Try again')}</Button>
				</div>
			)}

			{state === 'expired' && (
				<div className="p-4">
					<p className="mb-3">{t('QR code expired')}</p>
					<Button onClick={initSession}>
						<IcRefresh className="me-1" />
						{t('Click to refresh')}
					</Button>
				</div>
			)}

			{state === 'error' && (
				<div className="p-4">
					<p className="mb-3 text-error">{t('Failed to generate QR code')}</p>
					<Button onClick={initSession}>
						<IcRefresh className="me-1" />
						{t('Try again')}
					</Button>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
