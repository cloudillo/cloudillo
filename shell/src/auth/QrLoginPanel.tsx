// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, resolveDefaultExport, useApi, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcError,
	LuCheck as IcOk,
	LuQrCode as IcQr,
	LuRefreshCw as IcRefresh
} from 'react-icons/lu'
import ReactQRCode from 'react-qr-code'

import { installToken } from '../pwa.js'
import { useLoginInit } from './auth.js'
import { rateLimitMessage } from './utils.js'

const QRCode = resolveDefaultExport(ReactQRCode)

type PanelState =
	| 'loading'
	| 'showing'
	| 'approved'
	| 'denied'
	| 'expired'
	| 'blocked'
	| 'pollError'
	| 'error'

export function QrLoginPanel() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth, setAuth] = useAuth()

	const loginInitData = useLoginInit()
	const [state, setState] = React.useState<PanelState>('loading')
	const [sessionId, setSessionId] = React.useState<string>('')
	const [secret, setSecret] = React.useState<string>('')
	const [blockedMsg, setBlockedMsg] = React.useState<string>()
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

			let errorCount = 0

			const poll = async () => {
				while (!cancelled) {
					try {
						const result = await api.auth.getQrLoginStatus(sessionId, secret)
						if (cancelled) return
						errorCount = 0

						if (
							result.status === 'approved' &&
							result.login?.token &&
							result.login?.tnId &&
							result.login?.idTag &&
							result.login?.name
						) {
							setState('approved')

							// Complete login
							await installToken(result.login.token)
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
						// status === 'pending' → wait before re-polling
						await new Promise((r) => setTimeout(r, 1000))
					} catch (err) {
						if (cancelled) return
						// Rate-limit / access block: stop probing so we don't keep the
						// block alive. User must explicitly retry (re-inits a session).
						const rl = rateLimitMessage(err, t)
						if (rl) {
							setBlockedMsg(rl)
							setState('blocked')
							return
						}
						console.error('QR login poll failed:', err)
						errorCount++
						if (errorCount >= 5) {
							setState('pollError')
							return
						}
						// Bounded exponential backoff for transient errors (3s → 24s cap)
						const delay = Math.min(3000 * 2 ** (errorCount - 1), 24000)
						await new Promise((r) => setTimeout(r, delay))
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

			{state === 'blocked' && (
				<div className="p-4">
					<IcError style={{ fontSize: '3rem', color: 'var(--col-error)' }} />
					<p className="mt-2 mb-3 text-error">
						{blockedMsg ??
							t(
								'Access temporarily blocked. Please wait a moment before trying again.'
							)}
					</p>
					<Button onClick={initSession}>
						<IcRefresh className="me-1" />
						{t('Try again')}
					</Button>
				</div>
			)}

			{state === 'pollError' && (
				<div className="p-4">
					<p className="mb-3 text-error">{t('Connection lost. Please try again.')}</p>
					<Button onClick={initSession}>
						<IcRefresh className="me-1" />
						{t('Try again')}
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
