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
import {
	Routes,
	Route,
	Link,
	Navigate,
	useParams,
	useLocation,
	useNavigate
} from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'

import { Button, useApi, useToast } from '@cloudillo/react'
import { ApiClient } from '@cloudillo/core'

import { UsePWA } from '../pwa.js'
import { subscribeNotifications } from '../settings/notifications.js'
import { Welcome } from './welcome.js'

function next(api: ApiClient | null, location: string) {
	const nextPage = location == 'join' ? 'extras' : null

	if (api) {
		api.settings.update('ui.onboarding', { value: nextPage })
	}
	return nextPage ? '/onboarding/' + nextPage : '/app/feed'
}

function Join() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api, setIdTag } = useApi()
	const { error: toastError } = useToast()
	const [joining, setJoining] = React.useState(false)

	async function onJoin() {
		if (!api) return
		setJoining(true)
		try {
			const action = { type: 'CONN', audienceTag: 'cloudillo.net' }
			await api.actions.create(action)
			navigate(next(api, 'join'))
		} catch (err) {
			console.error('Failed to join community:', err)
			toastError(t('Failed to join community. You can try again later in Settings.'))
			setJoining(false)
		}
	}

	function onSkip() {
		navigate(next(api, 'join'))
	}

	function onBack() {
		navigate(-1)
	}

	return (
		<div className="c-panel p-4">
			<h1 className="mb-3">{t("You're in!")}</h1>

			<div className="c-panel primary p-4 my-4">
				<h3 className="mb-3">🌍 {t('Join the Cloudillo Community')}</h3>
				<p className="mb-3">
					{t(
						'Connect with other Cloudillo users, get help, and stay updated on new features.'
					)}
				</p>
				<div className="c-group g-2">
					<Button className="c-button primary" onClick={onJoin} disabled={joining}>
						{t('Join Community')}
					</Button>
					<Button className="c-button" onClick={onSkip}>
						{t('Maybe later')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// Combined convenience options (notifications + install)
function Extras({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api, setIdTag } = useApi()
	const [enableNotifications, setEnableNotifications] = React.useState(false)
	const [enableInstall, setEnableInstall] = React.useState(false)

	// Skip if neither option is available
	const canNotify = pwa.askNotify
	const canInstall = pwa.doInstall
	if (!canNotify && !canInstall) {
		// Nothing to show, go to feed
		if (api) {
			api.settings.update('ui.onboarding', { value: null })
		}
		return <Navigate to="/app/feed" />
	}

	async function onContinue() {
		if (enableNotifications && canNotify) {
			subscribeNotifications(api, pwa)
		}
		if (enableInstall && canInstall) {
			pwa.doInstall?.()
		}
		if (api) {
			api.settings.update('ui.onboarding', { value: null })
		}
		navigate('/app/feed')
	}

	function onSkip() {
		if (api) {
			api.settings.update('ui.onboarding', { value: null })
		}
		navigate('/app/feed')
	}

	return (
		<div className="c-panel p-4">
			<h3 className="mb-3">
				{t('A couple more things')} <span className="text-muted">({t('optional')})</span>
			</h3>

			<div className="c-panel my-4">
				{canNotify && (
					<label className="c-settings-field" style={{ maxWidth: 'none' }}>
						<span>
							{t('Enable notifications')}
							<br />
							<span className="text-muted small">
								{t('Know when someone messages you')}
							</span>
						</span>
						<input
							className="c-toggle primary"
							type="checkbox"
							checked={enableNotifications}
							onChange={(e) => setEnableNotifications(e.target.checked)}
						/>
					</label>
				)}

				{canInstall && (
					<label className="c-settings-field" style={{ maxWidth: 'none' }}>
						<span>
							{t('Add to home screen')}
							<br />
							<span className="text-muted small">
								{t('Quick access on your phone')}
							</span>
						</span>
						<input
							className="c-toggle primary"
							type="checkbox"
							checked={enableInstall}
							onChange={(e) => setEnableInstall(e.target.checked)}
						/>
					</label>
				)}
			</div>

			<div className="c-group g-2">
				{(enableNotifications || enableInstall) && (
					<Button className="c-button primary" onClick={onContinue}>
						{t('Enable selected')}
					</Button>
				)}
				<Button className="c-button" onClick={onSkip}>
					{t('Skip and start using Cloudillo →')}
				</Button>
			</div>
		</div>
	)
}

// Legacy routes for backwards compatibility
function Notifications({ pwa }: { pwa: UsePWA }) {
	return <Navigate to="/onboarding/extras" />
}

function Install({ pwa }: { pwa: UsePWA }) {
	return <Navigate to="/onboarding/extras" />
}

const ONBOARDING_STEPS = ['welcome', 'join', 'extras'] as const

function StepIndicator() {
	const { t } = useTranslation()
	const location = useLocation()

	const currentStep = ONBOARDING_STEPS.findIndex((step) =>
		location.pathname.includes(`/onboarding/${step}`)
	)
	if (currentStep < 0) return null

	return (
		<div className="c-hbox justify-content-center g-2 mb-3 mt-2">
			{ONBOARDING_STEPS.map((_, i) => (
				<div
					key={i}
					style={{
						width: '0.625rem',
						height: '0.625rem',
						borderRadius: '50%',
						background: i <= currentStep ? 'var(--col-primary)' : 'var(--col-border)'
					}}
				/>
			))}
			<span className="text-muted small ms-2">
				{t('Step {{current}} of {{total}}', {
					current: currentStep + 1,
					total: ONBOARDING_STEPS.length
				})}
			</span>
		</div>
	)
}

function Page({ children }: { children: React.ReactNode }) {
	return (
		<div className="c-container">
			<div className="row">
				<div className="col-0 col-md-1 col-lg-2" />
				<div className="col col-md-10 col-lg-8">
					<StepIndicator />
					<div className="flex-fill-x">{children}</div>
				</div>
				<div className="col-0 col-md-1 col-lg-2" />
			</div>
		</div>
	)
}

export function OnboardingRoutes({ pwa }: { pwa: UsePWA }) {
	return (
		<Page>
			<Routes>
				<Route path="/onboarding/welcome/:refId" element={<Welcome />} />
				<Route path="/onboarding/join" element={<Join />} />
				<Route path="/onboarding/extras" element={<Extras pwa={pwa} />} />
				{/* Legacy routes for backwards compatibility */}
				<Route path="/onboarding/notifications" element={<Notifications pwa={pwa} />} />
				<Route path="/onboarding/install" element={<Install pwa={pwa} />} />
				<Route path="/*" element={null} />
			</Routes>
		</Page>
	)
}

// vim: ts=4
