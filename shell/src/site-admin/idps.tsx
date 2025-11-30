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

import { LuTrash2 as IcDelete, LuPlus as IcAdd } from 'react-icons/lu'

import { useApi, useAuth } from '@cloudillo/react'

import { useSettings } from '../settings/settings.js'

// Domain validation regex
const DOMAIN_REGEX = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i

export function IdpsSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const { settings, onSettingChange } = useSettings('idp')
	const [idpList, setIdpList] = React.useState<string>('')
	const [newDomain, setNewDomain] = React.useState('')
	const [error, setError] = React.useState('')

	// Load the idp.list setting
	React.useEffect(function loadIdps() {
		if (!auth || !api) return

		(async function () {
			const res = await api.settings.list({ prefix: 'idp' })
			const setting = res.find((s: any) => s.key === 'idp.list')
			if (setting) {
				setIdpList(String(setting.value))
			}
		})()
	}, [auth, api])

	// Parse the comma-separated list of domains
	const domains = React.useMemo(() => {
		if (!idpList) return []
		return idpList.split(',').filter(Boolean).map(d => d.trim())
	}, [idpList])

	// Update the idp.list setting
	async function updateDomainList(newDomains: string[]) {
		if (!api) return
		const value = newDomains.join(',')
		setIdpList(value)
		await api.settings.update('idp.list', { value })
	}

	// Add a new domain
	async function handleAdd() {
		const domain = newDomain.trim().toLowerCase()

		// Validate input
		if (!domain) {
			setError(t('Please enter a domain'))
			return
		}

		if (!DOMAIN_REGEX.test(domain)) {
			setError(t('Invalid domain format'))
			return
		}

		if (domains.includes(domain)) {
			setError(t('Domain already exists'))
			return
		}

		// Add to list
		const newDomains = [...domains, domain]
		await updateDomainList(newDomains)

		// Clear input and error
		setNewDomain('')
		setError('')
	}

	// Remove a domain
	async function handleRemove(domain: string) {
		const newDomains = domains.filter(d => d !== domain)
		await updateDomainList(newDomains)
	}

	// Handle Enter key in input
	function handleKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
		if (evt.key === 'Enter') {
			evt.preventDefault()
			handleAdd()
		}
	}

	if (!settings) return null

	const renewalIntervalDays = (settings['idp.renewal_interval'] as number) || 365
	const renewalIntervalYears = Math.round(renewalIntervalDays / 365 * 10) / 10

	return <>
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
			<p className="c-hint mb-4">{t('Allow this tenant to act as an identity provider for other users')}</p>

			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Renewal interval (days)')}</span>
				<input
					className="c-input"
					name="idp.renewal_interval"
					type="number"
					min="1"
					max="18250"
					value={String(renewalIntervalDays)}
					onChange={onSettingChange}
				/>
			</label>
			<p className="c-hint mb-4">
				{t('How long identity credentials are valid')} ({renewalIntervalYears} {t('years')})
			</p>
		</div>

		<div className="c-panel">
			<h4>{t('Provider Public Info')}</h4>
			<p className="mb-4 text-secondary">
				{t('This information is shown to users during registration when they choose an identity provider.')}
			</p>

			<label className="d-block mb-3">
				<span className="d-block mb-1">{t('Provider Name')}</span>
				<input
					className="c-input w-100"
					name="idp.name"
					type="text"
					placeholder={t('e.g., Cloudillo')}
					value={String(settings['idp.name'] || '')}
					onChange={onSettingChange}
				/>
				<p className="c-hint mt-1">{t('Display name shown to users (defaults to domain if empty)')}</p>
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
				<p className="c-hint mt-1">{t('Short description with pricing, terms, or other important info')}</p>
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
				<p className="c-hint mt-1">{t('Optional link for more details about the provider')}</p>
			</label>
		</div>

		<div className="c-panel">
			<h4>{t('Trusted Identity Provider Domains')}</h4>
			<p className="mb-4 text-secondary">
				{t('Manage trusted identity providers. These domains can be used for federated authentication.')}
			</p>

			{/* Add new domain */}
			<div className="c-hbox g-2 mb-4">
				<input
					className="c-input flex-fill"
					type="text"
					placeholder={t('Enter domain (e.g., cloudillo.net)')}
					value={newDomain}
					onChange={(evt) => {
						setNewDomain(evt.target.value)
						setError('')
					}}
					onKeyDown={handleKeyDown}
				/>
				<button
					className="c-button primary"
					onClick={handleAdd}
					disabled={!newDomain.trim()}
				>
					<IcAdd/> {t('Add')}
				</button>
			</div>

			{/* Error message */}
			{error && (
				<div className="c-alert danger mb-4">
					{error}
				</div>
			)}

			{/* Domain list */}
			{domains.length === 0 ? (
				<div className="text-center text-secondary py-4">
					{t('No identity providers configured yet')}
				</div>
			) : (
				<div className="c-vbox g-2">
					{domains.map(domain => (
						<div key={domain} className="c-hbox c-panel low p-3">
							<span className="flex-fill font-mono">{domain}</span>
							<button
								className="c-link danger low"
								onClick={() => handleRemove(domain)}
								title={t('Remove')}
							>
								<IcDelete/>
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	</>
}

// vim: ts=4
