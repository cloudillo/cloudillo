// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuCheck as IcOk,
	LuX as IcDeny,
	LuRefreshCw as IcLoading,
	LuMonitor as IcDesktop
} from 'react-icons/lu'

import { useApi, Button } from '@cloudillo/react'

interface ApproveQrLoginViewProps {
	loginCode: string
	onDone: () => void
}

type ViewState = 'loading' | 'confirm' | 'responding' | 'success' | 'error'

export function ApproveQrLoginView({ loginCode, onDone }: ApproveQrLoginViewProps) {
	const { t } = useTranslation()
	const { api } = useApi()

	const [state, setState] = React.useState<ViewState>('loading')
	const [userAgent, setUserAgent] = React.useState<string | undefined>()
	const [ipAddress, setIpAddress] = React.useState<string | undefined>()
	const [error, setError] = React.useState<string | undefined>()

	// Fetch session details
	React.useEffect(
		function fetchDetails() {
			if (!api) return

			;(async () => {
				try {
					const details = await api.auth.getQrLoginDetails(loginCode)
					setUserAgent(details.userAgent ?? undefined)
					setIpAddress(details.ipAddress ?? undefined)
					setState('confirm')
				} catch (err) {
					console.error('Failed to fetch QR login details:', err)
					setError(t('Session expired or invalid'))
					setState('error')
				}
			})()
		},
		[api, loginCode]
	)

	async function handleRespond(approved: boolean) {
		if (!api) return
		setState('responding')

		try {
			await api.auth.respondQrLogin(loginCode, { approved })
			if (approved) {
				setState('success')
				setTimeout(onDone, 1500)
			} else {
				onDone()
			}
		} catch (err) {
			console.error('QR login respond failed:', err)
			setError(t('Failed to respond'))
			setState('error')
		}
	}

	// Parse browser name from user-agent
	function parseBrowser(ua?: string): string {
		if (!ua) return t('Unknown browser')
		if (ua.includes('Firefox')) return 'Firefox'
		if (ua.includes('Edg/')) return 'Edge'
		if (ua.includes('Chrome')) return 'Chrome'
		if (ua.includes('Safari')) return 'Safari'
		return t('Unknown browser')
	}

	return (
		<div
			className="c-vbox align-items-center justify-content-center p-4 g-3"
			style={{ color: '#fff', textAlign: 'center' }}
			onClick={(e) => e.stopPropagation()}
		>
			{state === 'loading' && (
				<IcLoading className="animate-rotate-cw" style={{ fontSize: '2rem' }} />
			)}

			{state === 'confirm' && (
				<>
					<IcDesktop style={{ fontSize: '3rem' }} />
					<h3>{t('Allow login from this device?')}</h3>
					<p>
						{parseBrowser(userAgent)}
						{ipAddress && ` — ${ipAddress}`}
					</p>
					<div className="c-hbox g-3">
						<Button
							onClick={() => handleRespond(false)}
							style={{ minWidth: '100px', minHeight: '48px' }}
						>
							<IcDeny className="me-1" />
							{t('Deny')}
						</Button>
						<Button
							variant="primary"
							onClick={() => handleRespond(true)}
							style={{ minWidth: '100px', minHeight: '48px' }}
						>
							<IcOk className="me-1" />
							{t('Allow')}
						</Button>
					</div>
				</>
			)}

			{state === 'responding' && (
				<IcLoading className="animate-rotate-cw" style={{ fontSize: '2rem' }} />
			)}

			{state === 'success' && (
				<>
					<IcOk style={{ fontSize: '3rem', color: 'var(--col-success)' }} />
					<p>{t('Login approved')}</p>
				</>
			)}

			{state === 'error' && (
				<>
					<IcDeny style={{ fontSize: '3rem', color: 'var(--col-error)' }} />
					<p>{error}</p>
					<Button onClick={onDone}>{t('Close')}</Button>
				</>
			)}
		</div>
	)
}

// vim: ts=4
