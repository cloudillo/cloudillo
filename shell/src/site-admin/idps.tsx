// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuTrash2 as IcDelete, LuPlus as IcAdd } from 'react-icons/lu'

import { useApi, useAuth } from '@cloudillo/react'

// Domain validation regex
const DOMAIN_REGEX = /^[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i

export function SuggestedProvidersSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [idpList, setIdpList] = React.useState<string>('')
	const [newDomain, setNewDomain] = React.useState('')
	const [error, setError] = React.useState('')

	// Load the idp.list setting
	React.useEffect(
		function loadIdps() {
			if (!auth || !api) return
			;(async function () {
				const res = await api.settings.list({ prefix: 'idp' })
				const setting = res.find((s) => s.key === 'idp.list')
				if (setting) {
					setIdpList(String(setting.value))
				}
			})()
		},
		[auth, api]
	)

	// Parse the comma-separated list of domains
	const domains = React.useMemo(() => {
		if (!idpList) return []
		return idpList
			.split(',')
			.filter(Boolean)
			.map((d) => d.trim())
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
		const newDomains = domains.filter((d) => d !== domain)
		await updateDomainList(newDomains)
	}

	// Handle Enter key in input
	function handleKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
		if (evt.key === 'Enter') {
			evt.preventDefault()
			handleAdd()
		}
	}

	return (
		<div className="c-panel">
			<h4>{t('Suggested Providers')}</h4>
			<p className="mb-4 text-secondary">
				{t(
					'These providers appear as suggestions during registration. Users can still register with any identity provider.'
				)}
			</p>

			{/* Add new domain */}
			<div className="c-hbox g-2 mb-4">
				<input
					className="c-input w-lg"
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
					<IcAdd /> {t('Add')}
				</button>
			</div>

			{/* Error message */}
			{error && <div className="c-alert error mb-4">{error}</div>}

			{/* Domain list */}
			{domains.length === 0 ? (
				<div className="text-center text-secondary py-4">
					{t('No suggested providers configured yet')}
				</div>
			) : (
				<div className="c-vbox g-2">
					{domains.map((domain) => (
						<div key={domain} className="c-hbox c-panel low p-3">
							<span className="flex-fill font-mono">{domain}</span>
							<button
								className="c-link error low"
								onClick={() => handleRemove(domain)}
								title={t('Remove')}
							>
								<IcDelete />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// vim: ts=4
