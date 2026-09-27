// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

dayjs.extend(relativeTime)

import type {
	CreateProxySiteRequest,
	ProxySiteData,
	ProxySiteStatus,
	UpdateProxySiteRequest
} from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Badge,
	Button,
	Card,
	Dialog,
	EmptyState,
	Field,
	HBox,
	Input,
	LoadingSpinner,
	NativeSelect,
	Panel,
	SearchInput,
	Segmented,
	SegmentedItem,
	Text,
	TextArea,
	Toggle,
	useApi,
	useAuth,
	useDialog,
	VBox
} from '@cloudillo/react'
import {
	LuShieldCheck as IcCert,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuPlus as IcPlus,
	LuNetwork as IcProxy,
	LuRefreshCw as IcRenew,
	LuSearch as IcSearch
} from 'react-icons/lu'

type ProxyType = 'basic' | 'advanced'

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
const STATUS_CONFIG: Record<ProxySiteStatus, { color: 'success' | 'error'; label: string }> = {
	A: { color: 'success', label: 'Active' },
	D: { color: 'error', label: 'Disabled' }
}

function StatusBadge({ status }: { status: ProxySiteStatus }) {
	const { t } = useTranslation()
	const config = STATUS_CONFIG[status]
	return <Badge color={config.color}>{t(config.label)}</Badge>
}

// Certificate expiry indicator
function CertInfo({ certExpiresAt }: { certExpiresAt?: string }) {
	const { t } = useTranslation()

	if (!certExpiresAt) {
		return (
			<Text size="sm" emphasis="muted">
				{t('No certificate')}
			</Text>
		)
	}

	const expires = dayjs(certExpiresAt)
	const daysLeft = expires.diff(dayjs(), 'day')
	const color = daysLeft < 7 ? 'error' : daysLeft < 30 ? 'warning' : 'success'

	return (
		<Text size="sm" color={color}>
			<IcCert /> {t('Expires {{date}}', { date: expires.format('MMM D, YYYY') })}
		</Text>
	)
}

// Advanced config draft (form strings) shared by the create and edit dialogs
interface ConfigDraft {
	connectTimeoutSecs: string
	readTimeoutSecs: string
	preserveHost: boolean
	forwardHeaders: boolean
	websocket: boolean
	proxyProtocol: boolean
	customHeaders: string
}

function draftFromSite(site?: ProxySiteData): ConfigDraft {
	const config = site?.config
	return {
		connectTimeoutSecs: config?.connectTimeoutSecs?.toString() ?? '',
		readTimeoutSecs: config?.readTimeoutSecs?.toString() ?? '',
		preserveHost: config?.preserveHost ?? false,
		forwardHeaders: config?.forwardHeaders ?? true,
		websocket: config?.websocket ?? false,
		proxyProtocol: config?.proxyProtocol ?? false,
		customHeaders: formatHeaders(config?.customHeaders as Record<string, string> | undefined)
	}
}

function configFromDraft(draft: ConfigDraft) {
	return {
		preserveHost: draft.preserveHost,
		forwardHeaders: draft.forwardHeaders,
		websocket: draft.websocket,
		proxyProtocol: draft.proxyProtocol,
		...(draft.connectTimeoutSecs
			? { connectTimeoutSecs: Number(draft.connectTimeoutSecs) }
			: {}),
		...(draft.readTimeoutSecs ? { readTimeoutSecs: Number(draft.readTimeoutSecs) } : {}),
		...(draft.customHeaders ? { customHeaders: parseHeaders(draft.customHeaders) } : {})
	}
}

function draftEquals(a: ConfigDraft, b: ConfigDraft) {
	return (Object.keys(a) as (keyof ConfigDraft)[]).every((k) => a[k] === b[k])
}

// Backend URL, type and (for advanced sites) the configuration panel
interface ProxyFieldsProps {
	backendUrl: string
	onBackendUrlChange: (url: string) => void
	backendUrlError?: string
	onBackendUrlBlur: () => void
	backendUrlRequired?: boolean
	type: ProxyType
	onTypeChange: (type: ProxyType) => void
	draft: ConfigDraft
	onDraftChange: (fn: (d: ConfigDraft) => ConfigDraft) => void
}

function ProxyFields({
	backendUrl,
	onBackendUrlChange,
	backendUrlError,
	onBackendUrlBlur,
	backendUrlRequired,
	type,
	onTypeChange,
	draft,
	onDraftChange
}: ProxyFieldsProps) {
	const { t } = useTranslation()

	function set<K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) {
		onDraftChange((d) => ({ ...d, [key]: value }))
	}

	return (
		<>
			<Field label={t('Backend URL')} required={backendUrlRequired} error={backendUrlError}>
				<Input
					placeholder="http://localhost:8080"
					value={backendUrl}
					onChange={(e) => onBackendUrlChange(e.target.value)}
					onBlur={onBackendUrlBlur}
				/>
			</Field>

			<Field label={t('Type')}>
				<NativeSelect
					value={type}
					onChange={(e) => onTypeChange(e.target.value as ProxyType)}
				>
					<option value="basic">{t('Basic')}</option>
					<option value="advanced">{t('Advanced')}</option>
				</NativeSelect>
			</Field>

			{type === 'advanced' && (
				<Panel title={t('Configuration')} padding={3}>
					<VBox gap={2}>
						<Field label={t('Connect Timeout (seconds)')}>
							<Input
								type="number"
								placeholder="10"
								value={draft.connectTimeoutSecs}
								onChange={(e) => set('connectTimeoutSecs', e.target.value)}
							/>
						</Field>
						<Field label={t('Read Timeout (seconds)')}>
							<Input
								type="number"
								placeholder="30"
								value={draft.readTimeoutSecs}
								onChange={(e) => set('readTimeoutSecs', e.target.value)}
							/>
						</Field>
						<Toggle
							label={t('Preserve Host Header')}
							checked={draft.preserveHost}
							onChange={(e) => set('preserveHost', e.target.checked)}
						/>
						<Toggle
							label={t('Forward Headers')}
							checked={draft.forwardHeaders}
							onChange={(e) => set('forwardHeaders', e.target.checked)}
						/>
						<Toggle
							label={t('WebSocket Support')}
							checked={draft.websocket}
							onChange={(e) => set('websocket', e.target.checked)}
						/>
						<Toggle
							label={t('Proxy Protocol')}
							checked={draft.proxyProtocol}
							onChange={(e) => set('proxyProtocol', e.target.checked)}
						/>
						<Field
							label={t('Custom Headers')}
							hint={t('One header per line: Name: Value')}
						>
							<TextArea
								rows={3}
								placeholder={'X-Custom: value\nX-Other: value'}
								value={draft.customHeaders}
								onChange={(e) => set('customHeaders', e.target.value)}
							/>
						</Field>
					</VBox>
				</Panel>
			)}
		</>
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
		<Card
			title={site.domain}
			actions={
				<HBox gap={1}>
					<Button
						variant="ghost"
						icon={<IcEdit />}
						aria-label={t('Edit')}
						onClick={() => onEdit(site)}
					/>
					<Button
						variant="ghost"
						color="error"
						icon={<IcDelete />}
						aria-label={t('Delete')}
						onClick={() => onDelete(site)}
					/>
				</HBox>
			}
		>
			<VBox gap={1}>
				<HBox gap={2} align="center">
					<StatusBadge status={site.status} />
					<Badge color={site.type === 'advanced' ? 'primary' : undefined}>
						{site.type}
					</Badge>
				</HBox>
				<Text size="sm" emphasis="muted" truncate>
					{site.backendUrl}
				</Text>
				<CertInfo certExpiresAt={site.certExpiresAt} />
			</VBox>
		</Card>
	)
}

// Create Proxy Site dialog
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
	const [type, setType] = React.useState<ProxyType>('basic')
	const [draft, setDraft] = React.useState<ConfigDraft>(draftFromSite)
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [backendUrlError, setBackendUrlError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open) {
			setDomain('')
			setBackendUrl('')
			setType('basic')
			setDraft(draftFromSite())
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
			...(type === 'advanced' ? { config: configFromDraft(draft) } : {})
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
		<Dialog
			open={open}
			onClose={onClose}
			title={t('Create Proxy Site')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={!isValid}
						loading={isSubmitting}
						onClick={handleCreate}
					>
						{t('Create')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && <Alert color="error">{error}</Alert>}

				<Field label={t('Domain')} required>
					<Input
						placeholder="example.com"
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
					/>
				</Field>

				<ProxyFields
					backendUrl={backendUrl}
					onBackendUrlChange={setBackendUrl}
					backendUrlError={backendUrlError}
					onBackendUrlBlur={() =>
						setBackendUrlError(validateBackendUrlValue(backendUrl, t))
					}
					backendUrlRequired
					type={type}
					onTypeChange={setType}
					draft={draft}
					onDraftChange={setDraft}
				/>
			</VBox>
		</Dialog>
	)
}

// Edit Proxy Site dialog
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
	const [type, setType] = React.useState<ProxyType>('basic')
	const [draft, setDraft] = React.useState<ConfigDraft>(draftFromSite)
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [backendUrlError, setBackendUrlError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open && site) {
			setStatus(site.status)
			setBackendUrl(site.backendUrl)
			setType(site.type)
			setDraft(draftFromSite(site))
			setError(undefined)
			setBackendUrlError(undefined)
		}
	}, [open, site])

	if (!site) return null

	const isDirty =
		status !== site.status ||
		backendUrl !== site.backendUrl ||
		type !== site.type ||
		(type === 'advanced' && !draftEquals(draft, draftFromSite(site)))

	async function handleSave() {
		if (!api || !site) return

		setIsSubmitting(true)
		setError(undefined)

		const data: UpdateProxySiteRequest = {
			status,
			backendUrl,
			type,
			...(type === 'advanced' ? { config: configFromDraft(draft) } : {})
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
		<Dialog
			open={open}
			onClose={onClose}
			title={site.domain}
			description={<StatusBadge status={site.status} />}
			footer={
				<ActionBar
					start={
						<Button color="error" icon={<IcDelete />} onClick={() => onDelete(site)}>
							{t('Delete')}
						</Button>
					}
				>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={!isDirty || !!backendUrlError}
						loading={isSubmitting}
						onClick={handleSave}
					>
						{t('Save')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && <Alert color="error">{error}</Alert>}

				<Toggle
					label={t('Enabled')}
					checked={status === 'A'}
					onChange={(e) => setStatus(e.target.checked ? 'A' : 'D')}
				/>

				<ProxyFields
					backendUrl={backendUrl}
					onBackendUrlChange={setBackendUrl}
					backendUrlError={backendUrlError}
					onBackendUrlBlur={() =>
						setBackendUrlError(validateBackendUrlValue(backendUrl, t))
					}
					type={type}
					onTypeChange={setType}
					draft={draft}
					onDraftChange={setDraft}
				/>

				<Panel title={t('TLS Certificate')} padding={3}>
					<HBox gap={2} align="center" justify="between">
						<CertInfo certExpiresAt={site.certExpiresAt} />
						<Button icon={<IcRenew />} onClick={() => onRenewCert(site)}>
							{t('Renew')}
						</Button>
					</HBox>
				</Panel>
			</VBox>
		</Dialog>
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
			),
			{ color: 'error', confirmLabel: t('Delete') }
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
			t('This will trigger a certificate renewal for {{domain}}.', { domain: site.domain }),
			{ confirmLabel: t('Renew') }
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

	function clearFilters() {
		setSearch('')
		setStatusFilter(undefined)
	}

	return (
		<VBox gap={3}>
			{/* Search and filter bar */}
			<Panel padding={2}>
				<VBox gap={2}>
					<HBox gap={2}>
						<SearchInput
							className="flex-fill"
							placeholder={t('Search by domain or backend URL...')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label={t('Search proxy sites')}
						/>
						<Button
							color="primary"
							icon={<IcPlus />}
							onClick={() => setShowCreateModal(true)}
						>
							{t('Create')}
						</Button>
					</HBox>

					{/* Status filter chips */}
					<Segmented
						aria-label={t('Status')}
						value={statusFilter ?? ''}
						onChange={(value) =>
							setStatusFilter((value || undefined) as ProxySiteStatus | undefined)
						}
					>
						<SegmentedItem value="">
							{t('All')} ({sites.length})
						</SegmentedItem>
						<SegmentedItem value="A">
							{t('Active')} ({counts.A})
						</SegmentedItem>
						<SegmentedItem value="D">
							{t('Disabled')} ({counts.D})
						</SegmentedItem>
					</Segmented>
				</VBox>
			</Panel>

			{/* Site list */}
			{loading ? (
				<LoadingSpinner className="auto-bg" label={t('Loading proxy sites...')} />
			) : filteredSites.length === 0 ? (
				search || statusFilter ? (
					<EmptyState
						className="auto-bg"
						icon={<IcSearch />}
						description={
							search
								? t('No proxy sites matching "{{query}}"', { query: search })
								: t('No {{status}} proxy sites', {
										status: statusFilter === 'A' ? t('active') : t('disabled')
									})
						}
						actions={
							<Button variant="link" onClick={clearFilters}>
								{t('Clear filters')}
							</Button>
						}
					/>
				) : (
					<EmptyState
						className="auto-bg"
						icon={<IcProxy />}
						title={t('No proxy sites yet')}
						description={t('Create your first proxy site to start reverse proxying.')}
						actions={
							<Button
								color="primary"
								icon={<IcPlus />}
								onClick={() => setShowCreateModal(true)}
							>
								{t('Create Proxy Site')}
							</Button>
						}
					/>
				)
			) : (
				<VBox gap={2}>
					{filteredSites.map((site) => (
						<ProxySiteCard
							key={site.siteId}
							site={site}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
					))}
				</VBox>
			)}

			{/* Dialogs */}
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
		</VBox>
	)
}

// vim: ts=4
