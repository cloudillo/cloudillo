// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { setApiToken } from '@cloudillo/core'
import {
	Alert,
	Button,
	Center,
	LoadingSpinner,
	Panel,
	QRCode,
	Text,
	useApi,
	useAuth
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuQrCode as IcQr, LuRefreshCw as IcRefresh } from 'react-icons/lu'

import { installToken } from '../pwa.js'
import { useLoginInit } from './auth.js'
import { rateLimitMessage } from './utils.js'

type PanelState =
	| 'loading'
	| 'showing'
	| 'approved'
	| 'denied'
	| 'expired'
	| 'blocked'
	| 'pollError'
	| 'error'

export function QrLoginPanel({ className }: { className?: string }) {
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
							setApiToken(result.login.idTag, result.login.token)
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

	const retry = (
		<Button icon={<IcRefresh />} onClick={initSession}>
			{state === 'expired' ? t('Click to refresh') : t('Try again')}
		</Button>
	)

	return (
		<Panel
			className={className}
			title={
				<>
					<IcQr /> {t('Scan QR code to log in')}
				</>
			}
		>
			<Center>
				{state === 'loading' && <LoadingSpinner />}

				{state === 'showing' && (
					<>
						<QRCode value={qrValue} size={200} label={t('Scan QR code to log in')} />
						<Text as="p" emphasis="muted" role="status">
							{t('Waiting for approval...')}
						</Text>
					</>
				)}

				{state === 'approved' && <Alert color="success">{t('Login approved')}</Alert>}

				{state === 'denied' && (
					<Alert color="error" actions={retry}>
						{t('Login denied')}
					</Alert>
				)}

				{state === 'expired' && (
					<Alert color="neutral" actions={retry}>
						{t('QR code expired')}
					</Alert>
				)}

				{state === 'blocked' && (
					<Alert color="error" actions={retry}>
						{blockedMsg ??
							t(
								'Access temporarily blocked. Please wait a moment before trying again.'
							)}
					</Alert>
				)}

				{state === 'pollError' && (
					<Alert color="error" actions={retry}>
						{t('Connection lost. Please try again.')}
					</Alert>
				)}

				{state === 'error' && (
					<Alert color="error" actions={retry}>
						{t('Failed to generate QR code')}
					</Alert>
				)}
			</Center>
		</Panel>
	)
}

// vim: ts=4
