// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Alert,
	Button,
	HBox,
	Input,
	List,
	ListItem,
	Panel,
	Text,
	useApi,
	useAuth
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus as IcAdd, LuTrash2 as IcDelete } from 'react-icons/lu'

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
		<Panel
			title={t('Suggested Providers')}
			description={t(
				'These providers appear as suggestions during registration. Users can still register with any identity provider.'
			)}
		>
			{/* Add new domain */}
			<HBox gap={2} className="mb-4">
				<Input
					className="flex-fill"
					style={{ minWidth: 0 }}
					type="text"
					aria-label={t('Domain')}
					placeholder={t('Enter domain (e.g., cloudillo.net)')}
					value={newDomain}
					onChange={(evt) => {
						setNewDomain(evt.target.value)
						setError('')
					}}
					onKeyDown={handleKeyDown}
				/>
				<Button
					color="primary"
					onClick={handleAdd}
					disabled={!newDomain.trim()}
					icon={<IcAdd />}
				>
					{t('Add')}
				</Button>
			</HBox>

			{error && (
				<Alert color="error" className="mb-4">
					{error}
				</Alert>
			)}

			{domains.length === 0 ? (
				<Text as="p" emphasis="muted" align="center" className="py-4">
					{t('No suggested providers configured yet')}
				</Text>
			) : (
				<List variant="divided">
					{domains.map((domain) => (
						<ListItem
							key={domain}
							title={<Text mono>{domain}</Text>}
							actions={
								<Button
									variant="ghost"
									color="error"
									size="sm"
									onClick={() => handleRemove(domain)}
									icon={<IcDelete />}
									aria-label={t('Remove')}
								/>
							}
						/>
					))}
				</List>
			)}
		</Panel>
	)
}

// vim: ts=4
