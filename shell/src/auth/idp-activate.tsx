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
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuRefreshCw as IcLoading,
	LuCheck as IcCheck,
	LuTriangleAlert as IcAlert
} from 'react-icons/lu'

import { useApi } from '@cloudillo/react'
import { CloudilloLogo } from '../logo.js'

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
		<div className="c-panel p-4">
			<CloudilloLogo className="c-logo w-50 float-right ps-3 pb-3" />
			<header>
				<h1 className="mb-3">{t('Identity Activation')}</h1>
			</header>

			{state === 'loading' && (
				<div className="c-panel info mt-3">
					<p>
						<IcLoading className="animate-rotate-cw me-2" />
						{t('Activating your identity...')}
					</p>
				</div>
			)}

			{state === 'error' && (
				<div className="c-panel error mt-3">
					<p>
						<IcAlert className="me-2" />
						{error || t('Activation failed')}
					</p>
				</div>
			)}

			{state === 'success' && (
				<>
					<div className="c-panel success mt-3">
						<p>
							<IcCheck className="me-2" />
							{t('Your identity has been activated successfully!')}
						</p>
						{identityId && (
							<p className="mt-2">
								<strong>{identityId}</strong>
							</p>
						)}
					</div>

					<div className="c-panel info mt-3">
						<h3 className="mb-2">{t("What's next?")}</h3>
						<p>{t('You will receive two emails to complete your registration:')}</p>
						<ul className="mt-2">
							<li>{t('Activation email from your Identity Provider (this one)')}</li>
							<li>{t('Onboarding email from your Cloudillo instance')}</li>
						</ul>
						<p className="mt-3">
							<strong>
								{t(
									'Please also check your inbox for the onboarding email and complete that activation too.'
								)}
							</strong>
						</p>
					</div>
				</>
			)}
		</div>
	)
}

// vim: ts=4
