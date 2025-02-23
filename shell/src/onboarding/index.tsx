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
import { Routes, Route, Link, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'

import { Button, useApi } from '@cloudillo/react'

import { UsePWA } from '../pwa.js'
import { subscribeNotifications } from '../settings/notifications.js'

function next(api: ReturnType<typeof useApi>, location: string) {
	const next =
		location == 'join' ? 'notifications'
		: location == 'notifications' ? 'install'
		: null

	api.put('', '/settings/ui.onboarding', { data: { value: next } })
	return next ? '/onboarding/' + next : '/app/feed'
}

function Join() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const api = useApi()

	async function onJoin() {
		const action = { type: 'CONN', audienceTag: 'cloudillo.net' }
		const res = await api.post('', '/action', { data: action })
		navigate(next(api, 'join'))
	}

	function onSkip() {
		navigate(next(api, 'join'))
	}

	return <div className="c-panel">
		<h1>{t('Join the Cloudillo Community')}</h1>
		<p className="py-4">{t('Do you want to start your Cloudillo experience alone, or want to be part of a helping community?')}</p>
		<div className="c-group g-1">
			<Button className="c-button primary" onClick={onJoin}>{t('Join the Cloudillo Community')}</Button>
			<Button className="c-button" onClick={onSkip}>{t('Skip')}</Button>
		</div>
	</div>
}

function Notifications({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const api = useApi()
	if (api.idTag && !pwa.askNotify) return <Navigate to={next(api, 'notifications')}/>

	async function onSubscribe() {
		subscribeNotifications(api, pwa)
		navigate(next(api, 'notifications'))
	}

	function onSkip() {
		navigate(next(api, 'notifications'))
	}

	return <div className="c-panel">
		<h1>{t('Push notifications')}</h1>
		<p className="py-4">{t('You can enable push notifications. You can finetune if in the settings.')}</p>
		<div className="c-group g-1">
			<Button className="c-button primary" onClick={onSubscribe}>{t('Enable notifications')}</Button>
			<Button className="c-button" onClick={onSkip}>{t('Skip')}</Button>
		</div>
	</div>
}

function Install({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const api = useApi()
	if (api.idTag && !pwa.doInstall) return <Navigate to={next(api, 'install')}/>

	async function onInstall() {
		pwa.doInstall?.()
		navigate(next(api, 'install'))
	}

	function onSkip() {
		navigate(next(api, 'install'))
	}

	return <div className="c-panel">
		<h1>{t('Install the Cloudillo Client')}</h1>
		<p className="py-4">{t('After installing the Cloudillo client, you can access it easily from your home screen or desktop.')}</p>
		<div className="c-group g-1">
			<Button className="c-button primary" onClick={onInstall}>{t('Install to home screen')}</Button>
			<Button className="c-button" onClick={onSkip}>{t('Skip')}</Button>
		</div>
	</div>
}

function Page({ children }: { children: React.ReactNode }) {
	return <div className="c-container"><div className="row">
		<div className="col-0 col-md-1 col-lg-2"/>
		<div className="col col-md-10 col-lg-8">
			<div className="flex-fill-x">
				{children}
			</div>
		</div>
		<div className="col-0 col-md-1 col-lg-2"/>
	</div></div>
}

export function OnboardingRoutes({ pwa }: { pwa: UsePWA }) {
	return <Page><Routes>
		<Route path="/onboarding/join" element={<Join/>}/>
		<Route path="/onboarding/notifications" element={<Notifications pwa={pwa}/>}/>
		<Route path="/onboarding/install" element={<Install pwa={pwa}/>}/>
		<Route path="/*" element={null}/>
	</Routes></Page>
}

// vim: ts=4
