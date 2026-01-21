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

import { useApi, useAuth } from '@cloudillo/react'

import { useSettings } from '../settings/settings.js'

export function ProviderSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const { settings, onSettingChange } = useSettings('idp')

	if (!settings) return null

	const renewalIntervalDays = (settings['idp.renewal_interval'] as number) || 365
	const renewalIntervalYears = Math.round((renewalIntervalDays / 365) * 10) / 10

	return (
		<>
			<div className="c-panel">
				<h4>{t('Identity Provider Configuration')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Enable Identity Provider functionality')}</span>
					<input
						className="c-toggle primary"
						name="idp.enabled"
						type="checkbox"
						checked={!!settings['idp.enabled']}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">
					{t('Allow this tenant to act as an identity provider for other users')}
				</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Renewal interval (days)')}</span>
					<input
						className="c-input w-sm"
						name="idp.renewal_interval"
						type="number"
						min="1"
						max="18250"
						value={String(renewalIntervalDays)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">
					{t('How long identity credentials are valid')} ({renewalIntervalYears}{' '}
					{t('years')})
				</p>
			</div>

			<div className="c-panel">
				<h4>{t('Provider Public Info')}</h4>
				<p className="mb-4 text-secondary">
					{t(
						'This information is shown to users during registration when they choose an identity provider.'
					)}
				</p>

				<label className="d-block mb-3">
					<span className="d-block mb-1">{t('Provider Name')}</span>
					<input
						className="c-input w-lg"
						name="idp.name"
						type="text"
						placeholder={t('e.g., Cloudillo')}
						value={String(settings['idp.name'] || '')}
						onChange={onSettingChange}
					/>
					<p className="c-hint mt-1">
						{t('Display name shown to users (defaults to domain if empty)')}
					</p>
				</label>

				<label className="d-block mb-3">
					<span className="d-block mb-1">{t('Provider Info')}</span>
					<textarea
						className="c-input w-100"
						name="idp.info"
						rows={3}
						placeholder={t('e.g., Free during early access. ~€3/year after launch.')}
						value={String(settings['idp.info'] || '')}
						onChange={onSettingChange}
					/>
					<p className="c-hint mt-1">
						{t('Short description with pricing, terms, or other important info')}
					</p>
				</label>

				<label className="d-block mb-3">
					<span className="d-block mb-1">{t('More Info URL')}</span>
					<input
						className="c-input w-100"
						name="idp.url"
						type="url"
						placeholder={t('e.g., https://cloudillo.net/about')}
						value={String(settings['idp.url'] || '')}
						onChange={onSettingChange}
					/>
					<p className="c-hint mt-1">
						{t('Optional link for more details about the provider')}
					</p>
				</label>
			</div>
		</>
	)
}

// vim: ts=4
