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
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

import {
	LuSearch as IcSearch,
	LuPlus as IcPlus,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuX as IcClose,
	LuShieldCheck as IcCert,
	LuRefreshCw as IcRenew,
	LuNetwork as IcProxy
} from 'react-icons/lu'

import type {
	ProxySiteData,
	ProxySiteStatus,
	CreateProxySiteRequest,
	UpdateProxySiteRequest
} from '@cloudillo/core'
import { useAuth, useApi, useDialog, Button, Modal, mergeClasses } from '@cloudillo/react'

// Backend URL validator
function validateBackendUrlValue(url: string, t: (key: string) => string): string | undefined {
	if (!url) return undefined
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		return t('Please enter a valid HTTP or HTTPS URL')
	}
	try {
		new URL(url)
	} catch {
		return t('Please enter a valid HTTP or HTTPS URL')
	}
	return undefined
}

// Status badge configuration
const STATUS_CONFIG: Record<ProxySiteStatus, { class: string; label: string }> = {
	A: { class: 'c-badge success', label: 'Active' },
	D: { class: 'c-badge error', label: 'Disabled' }
}

function StatusBadge({ status }: { status: ProxySiteStatus }) {
	const { t } = useTranslation()
	const config = STATUS_CONFIG[status]
	return <span className={config.class}>{t(config.label)}</span>
}

// Certificate expiry indicator
function CertInfo({ certExpiresAt }: { certExpiresAt?: string }) {
	const { t } = useTranslation()

	if (!certExpiresAt) {
		return <span className="c-hint small">{t('No certificate')}</span>
	}

	const expires = dayjs(certExpiresAt)
	const daysLeft = expires.diff(dayjs(), 'day')

	let colorClass = 'text-success'
	if (daysLeft < 7) colorClass = 'text-error'
	else if (daysLeft < 30) colorClass = 'text-warning'

	return (
		<span className={mergeClasses('small', colorClass)}>
			<IcCert className="mr-1" style={{ fontSize: '0.9em' }} />
			{t('Expires {{date}}', { date: expires.format('MMM D, YYYY') })}
		</span>
	)
}

// Filter chip component
function FilterChip({
	active,
	onClick,
	children
}: {
	active: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			className={mergeClasses('c-badge clickable', active ? 'primary' : '')}
			onClick={onClick}
		>
			{children}
		</button>
	)
}

// Proxy site list card
interface ProxySiteCardProps {
	site: ProxySiteData
	onEdit: (site: ProxySiteData) => void
	onDelete: (site: ProxySiteData) => void
}

function ProxySiteCard({ site, onEdit, onDelete }: ProxySiteCardProps) {
	const { t } = useTranslation()

	return (
		<div className="c-panel mb-2 p-2">
			<div className="c-hbox ai-center">
				<div className="flex-fill">
					<div className="c-hbox ai-center g-2 mb-1">
						<StatusBadge status={site.status} />
						<strong>{site.domain}</strong>
						<span
							className={mergeClasses(
								'c-badge',
								site.type === 'advanced' ? 'primary' : ''
							)}
						>
							{site.type}
						</span>
					</div>
					<div className="c-hint small mb-1">{site.backendUrl}</div>
					<CertInfo certExpiresAt={site.certExpiresAt} />
				</div>
				<div className="c-hbox g-1">
					<Button link onClick={() => onEdit(site)} title={t('Edit')}>
						<IcEdit />
					</Button>
					<Button
						link
						className="text-error"
						onClick={() => onDelete(site)}
						title={t('Delete')}
					>
						<IcDelete />
					</Button>
				</div>
			</div>
		</div>
	)
}

// Create Proxy Site Modal
interface CreateProxySiteModalProps {
	open: boolean
	onClose: () => void
	onCreated: (site: ProxySiteData) => void
}

function CreateProxySiteModal({ open, onClose, onCreated }: CreateProxySiteModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [domain, setDomain] = React.useState('')
	const [backendUrl, setBackendUrl] = React.useState('')
	const [type, setType] = React.useState<'basic' | 'advanced'>('basic')
	const [connectTimeoutSecs, setConnectTimeoutSecs] = React.useState('')
	const [readTimeoutSecs, setReadTimeoutSecs] = React.useState('')
	const [preserveHost, setPreserveHost] = React.useState(false)
	const [forwardHeaders, setForwardHeaders] = React.useState(true)
	const [websocket, setWebsocket] = React.useState(false)
	const [proxyProtocol, setProxyProtocol] = React.useState(false)
	const [customHeadersStr, setCustomHeadersStr] = React.useState('')
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [backendUrlError, setBackendUrlError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open) {
			setDomain('')
			setBackendUrl('')
			setType('basic')
			setConnectTimeoutSecs('')
			setReadTimeoutSecs('')
			setPreserveHost(false)
			setForwardHeaders(true)
			setWebsocket(false)
			setProxyProtocol(false)
			setCustomHeadersStr('')
			setError(undefined)
			setBackendUrlError(undefined)
		}
	}, [open])

	const isValid = domain.length > 0 && backendUrl.length > 0 && !backendUrlError

	async function handleCreate() {
		if (!api || !isValid) return

		setIsSubmitting(true)
		setError(undefined)

		const data: CreateProxySiteRequest = {
			domain,
			backendUrl,
			type,
			...(type === 'advanced'
				? {
						config: {
							preserveHost,
							forwardHeaders,
							websocket,
							proxyProtocol,
							...(connectTimeoutSecs
								? { connectTimeoutSecs: Number(connectTimeoutSecs) }
								: {}),
							...(readTimeoutSecs
								? { readTimeoutSecs: Number(readTimeoutSecs) }
								: {}),
							...(customHeadersStr
								? { customHeaders: parseHeaders(customHeadersStr) }
								: {})
						}
					}
				: {})
		}

		try {
			const result = await api.admin.createProxySite(data)
			onCreated(result)
			onClose()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			} else {
				setError(t('Failed to create proxy site'))
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '500px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<h3 className="flex-fill mb-0">{t('Create Proxy Site')}</h3>
					<button className="c-link" onClick={onClose} aria-label={t('Close')}>
						<IcClose />
					</button>
				</div>

				{error && (
					<div className="c-panel bg-error-subtle p-2 mb-3">
						<span className="text-error">{error}</span>
					</div>
				)}

				<div className="mb-3">
					<label className="c-label">
						{t('Domain')} <span className="text-error">*</span>
					</label>
					<input
						className="c-input"
						placeholder="example.com"
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
					/>
				</div>

				<div className="mb-3">
					<label className="c-label">
						{t('Backend URL')} <span className="text-error">*</span>
					</label>
					<input
						className={mergeClasses('c-input', backendUrlError && 'error')}
						placeholder="http://localhost:8080"
						value={backendUrl}
						onChange={(e) => setBackendUrl(e.target.value)}
						onBlur={() => setBackendUrlError(validateBackendUrlValue(backendUrl, t))}
					/>
					{backendUrlError && (
						<div className="c-hint small text-error mt-1">{backendUrlError}</div>
					)}
				</div>

				<div className="mb-3">
					<label className="c-label">{t('Type')}</label>
					<select
						className="c-select"
						value={type}
						onChange={(e) => setType(e.target.value as 'basic' | 'advanced')}
					>
						<option value="basic">{t('Basic')}</option>
						<option value="advanced">{t('Advanced')}</option>
					</select>
				</div>

				{type === 'advanced' && (
					<div className="c-panel bg-muted p-2 mb-3">
						<h4 className="pb-2">{t('Configuration')}</h4>
						<div className="mb-2">
							<label className="c-label">{t('Connect Timeout (seconds)')}</label>
							<input
								className="c-input"
								type="number"
								placeholder="10"
								value={connectTimeoutSecs}
								onChange={(e) => setConnectTimeoutSecs(e.target.value)}
							/>
						</div>
						<div className="mb-2">
							<label className="c-label">{t('Read Timeout (seconds)')}</label>
							<input
								className="c-input"
								type="number"
								placeholder="30"
								value={readTimeoutSecs}
								onChange={(e) => setReadTimeoutSecs(e.target.value)}
							/>
						</div>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={preserveHost}
								onChange={(e) => setPreserveHost(e.target.checked)}
							/>
							{t('Preserve Host Header')}
						</label>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={forwardHeaders}
								onChange={(e) => setForwardHeaders(e.target.checked)}
							/>
							{t('Forward Headers')}
						</label>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={websocket}
								onChange={(e) => setWebsocket(e.target.checked)}
							/>
							{t('WebSocket Support')}
						</label>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={proxyProtocol}
								onChange={(e) => setProxyProtocol(e.target.checked)}
							/>
							{t('Proxy Protocol')}
						</label>
						<div className="mb-2">
							<label className="c-label">{t('Custom Headers')}</label>
							<textarea
								className="c-input"
								rows={3}
								placeholder={'X-Custom: value\nX-Other: value'}
								value={customHeadersStr}
								onChange={(e) => setCustomHeadersStr(e.target.value)}
							/>
							<div className="c-hint small mt-1">
								{t('One header per line: Name: Value')}
							</div>
						</div>
					</div>
				)}

				<div className="c-hbox jc-end g-2">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button primary disabled={!isValid || isSubmitting} onClick={handleCreate}>
						{isSubmitting ? t('Creating...') : t('Create')}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// Edit Proxy Site Modal
interface EditProxySiteModalProps {
	open: boolean
	site: ProxySiteData | null
	onClose: () => void
	onUpdated: (site: ProxySiteData) => void
	onDelete: (site: ProxySiteData) => void
	onRenewCert: (site: ProxySiteData) => void
}

function EditProxySiteModal({
	open,
	site,
	onClose,
	onUpdated,
	onDelete,
	onRenewCert
}: EditProxySiteModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [status, setStatus] = React.useState<ProxySiteStatus>('A')
	const [backendUrl, setBackendUrl] = React.useState('')
	const [type, setType] = React.useState<'basic' | 'advanced'>('basic')
	const [connectTimeoutSecs, setConnectTimeoutSecs] = React.useState('')
	const [readTimeoutSecs, setReadTimeoutSecs] = React.useState('')
	const [preserveHost, setPreserveHost] = React.useState(false)
	const [forwardHeaders, setForwardHeaders] = React.useState(true)
	const [websocket, setWebsocket] = React.useState(false)
	const [proxyProtocol, setProxyProtocol] = React.useState(false)
	const [customHeadersStr, setCustomHeadersStr] = React.useState('')
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [backendUrlError, setBackendUrlError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open && site) {
			setStatus(site.status)
			setBackendUrl(site.backendUrl)
			setType(site.type)
			setConnectTimeoutSecs(site.config.connectTimeoutSecs?.toString() ?? '')
			setReadTimeoutSecs(site.config.readTimeoutSecs?.toString() ?? '')
			setPreserveHost(site.config.preserveHost ?? false)
			setForwardHeaders(site.config.forwardHeaders ?? true)
			setWebsocket(site.config.websocket ?? false)
			setProxyProtocol(site.config.proxyProtocol ?? false)
			setCustomHeadersStr(
				formatHeaders(site.config.customHeaders as Record<string, string> | undefined)
			)
			setError(undefined)
			setBackendUrlError(undefined)
		}
	}, [open, site])

	if (!site) return null

	const isDirty =
		status !== site.status ||
		backendUrl !== site.backendUrl ||
		type !== site.type ||
		(type === 'advanced' &&
			(connectTimeoutSecs !== (site.config.connectTimeoutSecs?.toString() ?? '') ||
				readTimeoutSecs !== (site.config.readTimeoutSecs?.toString() ?? '') ||
				preserveHost !== (site.config.preserveHost ?? false) ||
				forwardHeaders !== (site.config.forwardHeaders ?? true) ||
				websocket !== (site.config.websocket ?? false) ||
				proxyProtocol !== (site.config.proxyProtocol ?? false) ||
				customHeadersStr !==
					formatHeaders(site.config.customHeaders as Record<string, string> | undefined)))

	async function handleSave() {
		if (!api || !site) return

		setIsSubmitting(true)
		setError(undefined)

		const data: UpdateProxySiteRequest = {
			status,
			backendUrl,
			type,
			...(type === 'advanced'
				? {
						config: {
							preserveHost,
							forwardHeaders,
							websocket,
							proxyProtocol,
							...(connectTimeoutSecs
								? { connectTimeoutSecs: Number(connectTimeoutSecs) }
								: {}),
							...(readTimeoutSecs
								? { readTimeoutSecs: Number(readTimeoutSecs) }
								: {}),
							...(customHeadersStr
								? { customHeaders: parseHeaders(customHeadersStr) }
								: {})
						}
					}
				: {})
		}

		try {
			const result = await api.admin.updateProxySite(site.siteId, data)
			onUpdated(result)
			onClose()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			} else {
				setError(t('Failed to update proxy site'))
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '500px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<div className="flex-fill">
						<h3 className="mb-1">{site.domain}</h3>
						<StatusBadge status={site.status} />
					</div>
					<button className="c-link" onClick={onClose} aria-label={t('Close')}>
						<IcClose />
					</button>
				</div>

				{error && (
					<div className="c-panel bg-error-subtle p-2 mb-3">
						<span className="text-error">{error}</span>
					</div>
				)}

				<label className="c-hbox mb-3">
					<span className="flex-fill">{t('Enabled')}</span>
					<input
						type="checkbox"
						className="c-toggle primary"
						checked={status === 'A'}
						onChange={(e) => setStatus(e.target.checked ? 'A' : 'D')}
					/>
				</label>

				<div className="mb-3">
					<label className="c-label">{t('Backend URL')}</label>
					<input
						className={mergeClasses('c-input', backendUrlError && 'error')}
						placeholder="http://localhost:8080"
						value={backendUrl}
						onChange={(e) => setBackendUrl(e.target.value)}
						onBlur={() => setBackendUrlError(validateBackendUrlValue(backendUrl, t))}
					/>
					{backendUrlError && (
						<div className="c-hint small text-error mt-1">{backendUrlError}</div>
					)}
				</div>

				<div className="mb-3">
					<label className="c-label">{t('Type')}</label>
					<select
						className="c-select"
						value={type}
						onChange={(e) => setType(e.target.value as 'basic' | 'advanced')}
					>
						<option value="basic">{t('Basic')}</option>
						<option value="advanced">{t('Advanced')}</option>
					</select>
				</div>

				{/* Configuration - only shown for advanced type */}
				{type === 'advanced' && (
					<div className="c-panel bg-muted p-2 mb-3">
						<h4 className="pb-2">{t('Configuration')}</h4>
						<div className="mb-2">
							<label className="c-label">{t('Connect Timeout (seconds)')}</label>
							<input
								className="c-input"
								type="number"
								placeholder="10"
								value={connectTimeoutSecs}
								onChange={(e) => setConnectTimeoutSecs(e.target.value)}
							/>
						</div>
						<div className="mb-2">
							<label className="c-label">{t('Read Timeout (seconds)')}</label>
							<input
								className="c-input"
								type="number"
								placeholder="30"
								value={readTimeoutSecs}
								onChange={(e) => setReadTimeoutSecs(e.target.value)}
							/>
						</div>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={preserveHost}
								onChange={(e) => setPreserveHost(e.target.checked)}
							/>
							{t('Preserve Host Header')}
						</label>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={forwardHeaders}
								onChange={(e) => setForwardHeaders(e.target.checked)}
							/>
							{t('Forward Headers')}
						</label>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={websocket}
								onChange={(e) => setWebsocket(e.target.checked)}
							/>
							{t('WebSocket Support')}
						</label>
						<label className="c-hbox ai-center mb-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2"
								checked={proxyProtocol}
								onChange={(e) => setProxyProtocol(e.target.checked)}
							/>
							{t('Proxy Protocol')}
						</label>
						<div className="mb-2">
							<label className="c-label">{t('Custom Headers')}</label>
							<textarea
								className="c-input"
								rows={3}
								placeholder={'X-Custom: value\nX-Other: value'}
								value={customHeadersStr}
								onChange={(e) => setCustomHeadersStr(e.target.value)}
							/>
							<div className="c-hint small mt-1">
								{t('One header per line: Name: Value')}
							</div>
						</div>
					</div>
				)}

				{/* Certificate section */}
				<div className="c-panel bg-muted p-2 mb-3">
					<div className="c-hbox jc-between ai-center">
						<div>
							<h4 className="mb-1">{t('TLS Certificate')}</h4>
							<CertInfo certExpiresAt={site.certExpiresAt} />
						</div>
						<Button className="small" onClick={() => onRenewCert(site)}>
							<IcRenew className="mr-1" />
							{t('Renew')}
						</Button>
					</div>
				</div>

				{/* Footer actions */}
				<footer className="c-hbox g-2 mt-3 pt-3 border-top jc-between">
					<Button className="error" onClick={() => onDelete(site)}>
						<IcDelete className="mr-1" />
						{t('Delete')}
					</Button>
					<div className="c-hbox g-2">
						<Button onClick={onClose}>{t('Cancel')}</Button>
						<Button
							primary
							disabled={!isDirty || !!backendUrlError || isSubmitting}
							onClick={handleSave}
						>
							{isSubmitting ? t('Saving...') : t('Save')}
						</Button>
					</div>
				</footer>
			</div>
		</Modal>
	)
}

// Helper: parse "Key: Value" lines into Record
function parseHeaders(str: string): Record<string, string> {
	const headers: Record<string, string> = {}
	for (const line of str.split('\n')) {
		const idx = line.indexOf(':')
		if (idx > 0) {
			headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
		}
	}
	return headers
}

// Helper: format Record into "Key: Value" lines
function formatHeaders(headers?: Record<string, string>): string {
	if (!headers || typeof headers !== 'object') return ''
	return Object.entries(headers)
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n')
}

// Main ProxySites component
export function ProxySites() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()

	const [sites, setSites] = React.useState<ProxySiteData[]>([])
	const [loading, setLoading] = React.useState(true)
	const [search, setSearch] = React.useState('')
	const [statusFilter, setStatusFilter] = React.useState<ProxySiteStatus | undefined>()

	// Modal state
	const [showCreateModal, setShowCreateModal] = React.useState(false)
	const [showEditModal, setShowEditModal] = React.useState(false)
	const [selectedSite, setSelectedSite] = React.useState<ProxySiteData | null>(null)

	// Load sites
	React.useEffect(
		function loadSites() {
			if (!auth || !api) return

			async function load() {
				setLoading(true)
				try {
					const result = await api!.admin.listProxySites()
					setSites(result || [])
				} catch (err) {
					console.error('Failed to load proxy sites:', err)
				} finally {
					setLoading(false)
				}
			}
			load()
		},
		[auth, api]
	)

	// Filter sites client-side
	const filteredSites = React.useMemo(() => {
		let filtered = sites
		if (statusFilter) {
			filtered = filtered.filter((s) => s.status === statusFilter)
		}
		if (search) {
			const q = search.toLowerCase()
			filtered = filtered.filter(
				(s) => s.domain.toLowerCase().includes(q) || s.backendUrl.toLowerCase().includes(q)
			)
		}
		return filtered
	}, [sites, statusFilter, search])

	// Status counts
	const counts = React.useMemo(() => {
		const c = { A: 0, D: 0 }
		for (const s of sites) {
			if (s.status in c) c[s.status]++
		}
		return c
	}, [sites])

	function handleCreated(site: ProxySiteData) {
		setSites((prev) => [site, ...prev])
	}

	function handleEdit(site: ProxySiteData) {
		setSelectedSite(site)
		setShowEditModal(true)
	}

	function handleUpdated(updated: ProxySiteData) {
		setSites((prev) => prev.map((s) => (s.siteId === updated.siteId ? updated : s)))
	}

	async function handleDelete(site: ProxySiteData) {
		const confirmed = await dialog.confirm(
			t('Delete {{domain}}?', { domain: site.domain }),
			t(
				'This will permanently delete this proxy site configuration. This action cannot be undone.'
			)
		)
		if (!confirmed) return

		try {
			await api!.admin.deleteProxySite(site.siteId)
			setSites((prev) => prev.filter((s) => s.siteId !== site.siteId))
			setShowEditModal(false)
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message)
			}
		}
	}

	async function handleRenewCert(site: ProxySiteData) {
		const confirmed = await dialog.confirm(
			t('Renew certificate?'),
			t('This will trigger a certificate renewal for {{domain}}.', { domain: site.domain })
		)
		if (!confirmed) return

		try {
			await api!.admin.renewProxySiteCert(site.siteId)
			// Reload list to get updated cert info
			const result = await api!.admin.listProxySites()
			setSites(result || [])
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message)
			}
		}
	}

	return (
		<>
			{/* Search and filter bar */}
			<div className="c-panel mb-3 p-2">
				<div className="c-hbox g-2 mb-2">
					<div className="c-input-group flex-fill">
						<IcSearch className="c-input-icon" />
						<input
							className="c-input"
							placeholder={t('Search by domain or backend URL...')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label={t('Search proxy sites')}
						/>
						{search && (
							<button
								className="c-input-clear"
								onClick={() => setSearch('')}
								aria-label={t('Clear search')}
							>
								<IcClose />
							</button>
						)}
					</div>
					<Button primary onClick={() => setShowCreateModal(true)}>
						<IcPlus className="mr-1" />
						{t('Create')}
					</Button>
				</div>

				{/* Status filter chips */}
				<div className="c-hbox g-1 flex-wrap">
					<FilterChip active={!statusFilter} onClick={() => setStatusFilter(undefined)}>
						{t('All')} ({sites.length})
					</FilterChip>
					<FilterChip active={statusFilter === 'A'} onClick={() => setStatusFilter('A')}>
						{t('Active')} ({counts.A})
					</FilterChip>
					<FilterChip active={statusFilter === 'D'} onClick={() => setStatusFilter('D')}>
						{t('Disabled')} ({counts.D})
					</FilterChip>
				</div>
			</div>

			{/* Site list */}
			{loading ? (
				<div className="c-panel p-4 text-center">
					<p className="c-hint">{t('Loading proxy sites...')}</p>
				</div>
			) : filteredSites.length === 0 ? (
				<div className="c-panel p-4 text-center">
					{search || statusFilter ? (
						<>
							<IcSearch className="text-muted mb-2" style={{ fontSize: '2rem' }} />
							<p className="c-hint">
								{search
									? t('No proxy sites matching "{{query}}"', { query: search })
									: t('No {{status}} proxy sites', {
											status:
												statusFilter === 'A' ? t('active') : t('disabled')
										})}
							</p>
							<Button
								link
								onClick={() => {
									setSearch('')
									setStatusFilter(undefined)
								}}
							>
								{t('Clear filters')}
							</Button>
						</>
					) : (
						<>
							<IcProxy className="text-muted mb-2" style={{ fontSize: '3rem' }} />
							<h4>{t('No proxy sites yet')}</h4>
							<p className="c-hint mb-3">
								{t('Create your first proxy site to start reverse proxying.')}
							</p>
							<Button primary onClick={() => setShowCreateModal(true)}>
								<IcPlus className="mr-1" />
								{t('Create Proxy Site')}
							</Button>
						</>
					)}
				</div>
			) : (
				<div>
					{filteredSites.map((site) => (
						<ProxySiteCard
							key={site.siteId}
							site={site}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
					))}
				</div>
			)}

			{/* Modals */}
			<CreateProxySiteModal
				open={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				onCreated={handleCreated}
			/>

			<EditProxySiteModal
				open={showEditModal}
				site={selectedSite}
				onClose={() => {
					setShowEditModal(false)
					setSelectedSite(null)
				}}
				onUpdated={handleUpdated}
				onDelete={handleDelete}
				onRenewCert={handleRenewCert}
			/>
		</>
	)
}

// vim: ts=4
