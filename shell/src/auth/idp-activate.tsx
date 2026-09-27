// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Alert, List, ListItem, LoadingSpinner, Logo, Text, useApi } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { AuthLayout } from './AuthLayout.js'

type ActivationState = 'loading' | 'success' | 'error'

export function IdpActivate() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { refId } = useParams<{ refId: string }>()
	const [state, setState] = React.useState<ActivationState>('loading')
	const [error, setError] = React.useState<string | undefined>()
	const [identityId, setIdentityId] = React.useState<string | undefined>()
	const activationAttempted = React.useRef(false)

	React.useEffect(() => {
		async function activateIdentity() {
			if (!refId) {
				setState('error')
				setError(t('Invalid or missing activation reference'))
				return
			}

			if (!api) {
				return
			}

			// Prevent double activation
			if (activationAttempted.current) {
				return
			}
			activationAttempted.current = true

			try {
				const result = await api.idp.activate({ refId })
				setIdentityId(result.idTag)
				setState('success')
			} catch (err) {
				setState('error')
				if (err instanceof Error) {
					if (err.message.includes('expired') || err.message.includes('not found')) {
						setError(t('This activation link has expired or is no longer valid.'))
					} else if (err.message.includes('not in Pending')) {
						setError(t('This identity has already been activated.'))
					} else {
						setError(err.message)
					}
				} else {
					setError(t('Failed to activate identity'))
				}
			}
		}

		activateIdentity()
	}, [api, refId, t])

	return (
		<AuthLayout
			width="md"
			logo={<Logo animated={state === 'loading'} />}
			title={t('Identity Activation')}
		>
			{state === 'loading' && (
				<Alert color="info" icon={<LoadingSpinner size="sm" />}>
					{t('Activating your identity...')}
				</Alert>
			)}

			{state === 'error' && <Alert color="error">{error || t('Activation failed')}</Alert>}

			{state === 'success' && (
				<>
					<Alert color="success">
						<Text as="p">{t('Your identity has been activated successfully!')}</Text>
						{identityId && (
							<Text as="p" weight="bold">
								{identityId}
							</Text>
						)}
					</Alert>

					<Alert color="info" title={t("What's next?")}>
						<List marker="bullet">
							<ListItem>
								{t(
									'If you registered a personal identity, check your inbox for a welcome email to finish setting up your profile.'
								)}
							</ListItem>
							<ListItem>
								{t(
									'If you activated a community identity, it is now ready to use in Cloudillo.'
								)}
							</ListItem>
						</List>
					</Alert>
				</>
			)}
		</AuthLayout>
	)
}

// vim: ts=4
