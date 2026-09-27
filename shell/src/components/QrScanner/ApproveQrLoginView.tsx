// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, EmptyState, LoadingSpinner, useApi } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcDeny, LuMonitor as IcDesktop, LuCheck as IcOk } from 'react-icons/lu'

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
		<>
			{(state === 'loading' || state === 'responding') && <LoadingSpinner inverse />}

			{state === 'confirm' && (
				<EmptyState
					inverse
					icon={<IcDesktop />}
					title={t('Allow login from this device?')}
					description={`${parseBrowser(userAgent)}${ipAddress ? ` — ${ipAddress}` : ''}`}
					actions={
						<>
							<Button
								size="lg"
								icon={<IcDeny />}
								onClick={() => handleRespond(false)}
							>
								{t('Deny')}
							</Button>
							<Button
								size="lg"
								color="primary"
								icon={<IcOk />}
								onClick={() => handleRespond(true)}
							>
								{t('Allow')}
							</Button>
						</>
					}
				/>
			)}

			{state === 'success' && (
				<EmptyState inverse color="success" icon={<IcOk />} title={t('Login approved')} />
			)}

			{state === 'error' && (
				<EmptyState
					inverse
					color="error"
					icon={<IcDeny />}
					title={error}
					actions={<Button onClick={onDone}>{t('Close')}</Button>}
				/>
			)}
		</>
	)
}

// vim: ts=4
