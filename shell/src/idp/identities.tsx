// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

dayjs.extend(relativeTime)

import type {
	IdpApiKey,
	IdpCreateApiKeyResult,
	IdpCreateIdentityResult,
	IdpIdentity
} from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Badge,
	Button,
	Checkbox,
	CodeBlock,
	DescriptionList,
	Dialog,
	EmptyState,
	Field,
	HBox,
	Input,
	List,
	ListItem,
	LoadingSpinner,
	Panel,
	SearchInput,
	Segmented,
	SegmentedItem,
	Text,
	Toggle,
	useAuth,
	useDialog,
	VBox
} from '@cloudillo/react'
import {
	LuBan as IcBan,
	LuCheck as IcCheck,
	LuCircle as IcCircle,
	LuCircleDot as IcCircleDot,
	LuTrash as IcDelete,
	LuKey as IcKey,
	LuPlus as IcPlus,
	LuSearch as IcSearch,
	LuUsers as IcUsers
} from 'react-icons/lu'

import { contextRolesAtom, useApiContext, useCtx } from '../context'

// Status badge configuration
const STATUS_CONFIG = {
	active: { color: 'success', icon: IcCircleDot, label: 'Active' },
	pending: { color: 'warning', icon: IcCircle, label: 'Pending' },
	suspended: { color: 'error', icon: IcBan, label: 'Suspended' }
} as const

// Helper to format dates
function formatDate(date: string | number): string {
	return dayjs(date).format('MMM D, YYYY')
}

function formatDateTime(date: string | number): string {
	return dayjs(date).format('MMM D, YYYY HH:mm')
}

// Helper to format relative time
function formatRelative(date: string | number): string {
	return dayjs(date).fromNow()
}

// Status badge component
function StatusBadge({ status }: { status: 'pending' | 'active' | 'suspended' }) {
	const { t } = useTranslation()
	const config = STATUS_CONFIG[status]
	const Icon = config.icon
	return (
		<Badge color={config.color} icon={<Icon />}>
			{t(config.label)}
		</Badge>
	)
}

// Identity row
interface IdentityRowProps {
	identity: IdpIdentity
	onViewDetails: (identity: IdpIdentity) => void
	onDelete: (identity: IdpIdentity) => void
}

function IdentityRow({ identity, onViewDetails, onDelete }: IdentityRowProps) {
	const { t } = useTranslation()

	return (
		<ListItem
			title={identity.idTag}
			subtitle={[
				identity.email,
				t('Created {{date}}', { date: formatDate(identity.createdAt) }),
				identity.expiresAt &&
					t('Expires {{date}}', { date: formatDate(identity.expiresAt) })
			]
				.filter(Boolean)
				.join(' · ')}
			trailing={<StatusBadge status={identity.status} />}
			actions={
				<Button
					variant="ghost"
					color="error"
					icon={<IcDelete />}
					aria-label={t('Delete identity')}
					onClick={() => onDelete(identity)}
				/>
			}
			onClick={() => onViewDetails(identity)}
		/>
	)
}

// Create Identity dialog
interface CreateIdentityModalProps {
	open: boolean
	idpDomain: string
	onClose: () => void
	onCreated: (result: IdpCreateIdentityResult) => void
}

function CreateIdentityModal({ open, idpDomain, onClose, onCreated }: CreateIdentityModalProps) {
	const { t } = useTranslation()
	const { getClientFor } = useApiContext()
	// Not read — it is the re-render signal. `getClientFor` returns null for a
	// foreign idTag until its proxy token is registered, and the token and this
	// atom are written in the same tick, so the memo cannot freeze that null.
	const contextRoles = useAtomValue(contextRolesAtom)
	const api = React.useMemo(
		() => getClientFor(idpDomain),
		[getClientFor, idpDomain, contextRoles]
	)
	const [idTagPrefix, setIdTagPrefix] = React.useState('')
	const [email, setEmail] = React.useState('')
	const [createApiKey, setCreateApiKey] = React.useState(false)
	const [apiKeyName, setApiKeyName] = React.useState('')
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [nameError, setNameError] = React.useState<string | undefined>()
	const [emailError, setEmailError] = React.useState<string | undefined>()
	const [sendActivationEmail, setSendActivationEmail] = React.useState(true)

	// Reset form when modal opens
	React.useEffect(() => {
		if (open) {
			setIdTagPrefix('')
			setEmail('')
			setCreateApiKey(false)
			setApiKeyName('')
			setError(undefined)
			setNameError(undefined)
			setEmailError(undefined)
			setSendActivationEmail(true)
		}
	}, [open])

	function validateName() {
		if (!idTagPrefix) {
			setNameError(undefined)
			return false
		}
		if (idTagPrefix.length < 3 || idTagPrefix.length > 32) {
			setNameError(t('Must be 3-32 characters'))
			return false
		}
		if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(idTagPrefix)) {
			setNameError(t('Letters, numbers, and hyphens only. Cannot start or end with hyphen.'))
			return false
		}
		setNameError(undefined)
		return true
	}

	function validateEmail() {
		if (!email) {
			setEmailError(undefined)
			return false
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setEmailError(t('Invalid email address'))
			return false
		}
		setEmailError(undefined)
		return true
	}

	const isValid = idTagPrefix.length >= 3 && email && !nameError && !emailError

	async function handleCreate() {
		if (!api || !isValid) return

		setIsSubmitting(true)
		setError(undefined)

		try {
			const result = await api.idpManagement.createIdentity({
				idTag: `${idTagPrefix}.${idpDomain}`,
				email,
				sendActivationEmail,
				createApiKey,
				apiKeyName: createApiKey && apiKeyName ? apiKeyName : undefined
			})
			onCreated(result)
			onClose()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			} else {
				setError(t('Failed to create identity'))
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="md"
			title={t('Create New Identity')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={!isValid}
						loading={isSubmitting}
						onClick={handleCreate}
					>
						{t('Create Identity')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && <Alert color="error">{error}</Alert>}

				<Field
					label={t('Identity Name')}
					required
					error={nameError}
					hint={t('Letters, numbers, and hyphens. 3-32 characters.')}
				>
					<Input
						placeholder="alice"
						value={idTagPrefix}
						onChange={(e) => setIdTagPrefix(e.target.value.toLowerCase())}
						onBlur={validateName}
						trailing={`.${idpDomain}`}
					/>
				</Field>

				<Field label={t('Owner Email')} required error={emailError}>
					<Input
						type="email"
						placeholder="alice@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						onBlur={validateEmail}
					/>
				</Field>

				<Checkbox
					label={t('Send activation email')}
					description={
						sendActivationEmail
							? t('User will receive an activation link via email.')
							: t('Identity will be created as active immediately.')
					}
					checked={sendActivationEmail}
					onChange={(e) => setSendActivationEmail(e.target.checked)}
				/>

				<Checkbox
					label={t('Create API key')}
					description={t(
						'Generate an API key for programmatic access (e.g., dynamic DNS updates).'
					)}
					checked={createApiKey}
					onChange={(e) => setCreateApiKey(e.target.checked)}
				/>

				{createApiKey && (
					<Field label={t('Key Name (optional)')}>
						<Input
							placeholder={t('e.g., Home server DynDNS')}
							value={apiKeyName}
							onChange={(e) => setApiKeyName(e.target.value)}
						/>
					</Field>
				)}
			</VBox>
		</Dialog>
	)
}

// Shows a freshly created API key once — after identity creation or from the details dialog
interface ApiKeyDialogProps {
	open: boolean
	identity: IdpIdentity | null
	apiKey: IdpCreateApiKeyResult | null
	idpDomain: string
	/** The key came with a new identity: say so in the title */
	identityCreated?: boolean
	onClose: () => void
}

function ApiKeyDialog({
	open,
	identity,
	apiKey,
	idpDomain,
	identityCreated,
	onClose
}: ApiKeyDialogProps) {
	const { t } = useTranslation()

	if (!identity || !apiKey) return null

	const idTag = identity.idTag
	const idPrefix = idTag.split('.')[0]
	const curlCommand = `curl -X PUT "https://cl-o.${idpDomain}/api/idp/identities/${idPrefix}/address" \\
  -H "Authorization: Bearer ${apiKey.plaintextKey}"`

	return (
		<Dialog
			open={open}
			onClose={onClose}
			dismissable={false}
			size="md"
			icon={identityCreated ? <IcCheck /> : <IcKey />}
			title={identityCreated ? t('Identity Created Successfully') : t('API Key Created')}
			footer={
				<ActionBar>
					<Button color="primary" onClick={onClose}>
						{t("I've saved the key")}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{identityCreated && (
					<Alert color="success">
						{t(
							'{{identity}} has been created. An activation email has been sent to {{email}}.',
							{
								identity: idTag,
								email: identity.email
							}
						)}
					</Alert>
				)}

				<Alert color="warning" title={t('Save this API key now!')}>
					{t('This key will only be shown once. Store it securely.')}
				</Alert>

				<Field label={t('API Key')}>
					<CodeBlock copyable>{apiKey.plaintextKey}</CodeBlock>
				</Field>

				<Field
					label={t('Example: Update IP Address')}
					hint={t('Updates the IP address automatically from the client IP.')}
				>
					<CodeBlock copyable>{curlCommand}</CodeBlock>
				</Field>
			</VBox>
		</Dialog>
	)
}

// Identity Details dialog
interface IdentityDetailsModalProps {
	open: boolean
	identity: IdpIdentity | null
	idpDomain: string
	onClose: () => void
	onDelete: (identity: IdpIdentity) => void
	onApiKeyCreated: (apiKey: IdpCreateApiKeyResult) => void
}

function IdentityDetailsModal({
	open,
	identity,
	idpDomain,
	onClose,
	onDelete,
	onApiKeyCreated
}: IdentityDetailsModalProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const { getClientFor } = useApiContext()
	// Re-render signal for the proxy token's arrival, not a value we read.
	const contextRoles = useAtomValue(contextRolesAtom)
	const api = React.useMemo(
		() => getClientFor(idpDomain),
		[getClientFor, idpDomain, contextRoles]
	)
	const [apiKeys, setApiKeys] = React.useState<IdpApiKey[]>([])
	const [loading, setLoading] = React.useState(false)
	const [showCreateKeyForm, setShowCreateKeyForm] = React.useState(false)
	const [keyName, setKeyName] = React.useState('')
	const [creatingKey, setCreatingKey] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const [dyndns, setDyndns] = React.useState(false)
	const [updatingDyndns, setUpdatingDyndns] = React.useState(false)

	// Load API keys and initialize dyndns when modal opens
	React.useEffect(() => {
		if (open && identity && api) {
			loadApiKeys()
			setDyndns(identity.dyndns)
		}
	}, [open, identity, api])

	// Reset state when modal closes
	React.useEffect(() => {
		if (!open) {
			setError(null)
			setUpdatingDyndns(false)
		}
	}, [open])

	async function loadApiKeys() {
		if (!api || !identity) return
		setLoading(true)
		try {
			const keys = await api.idpManagement.listApiKeys(identity.idTag)
			setApiKeys(keys)
		} catch (err) {
			console.error('Failed to load API keys:', err)
			setApiKeys([])
		} finally {
			setLoading(false)
		}
	}

	async function handleCreateApiKey() {
		if (!api || !identity) return
		setCreatingKey(true)
		setError(null)
		try {
			const result = await api.idpManagement.createApiKey({
				idTag: identity.idTag,
				name: keyName || undefined
			})
			setShowCreateKeyForm(false)
			setKeyName('')
			onApiKeyCreated(result)
			await loadApiKeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			}
		} finally {
			setCreatingKey(false)
		}
	}

	async function handleRevoke(key: IdpApiKey) {
		if (!api || !identity) return
		const confirmed = await dialog.confirm(
			t('Revoke API key?'),
			t('Revoke this API key? This cannot be undone.'),
			{ color: 'error', confirmLabel: t('Revoke') }
		)
		if (!confirmed) return
		setError(null)
		try {
			await api.idpManagement.deleteApiKey(key.id, identity.idTag)
			await loadApiKeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			}
		}
	}

	async function handleDyndnsChange(newValue: boolean) {
		if (!api || !identity) return
		setUpdatingDyndns(true)
		setError(null)
		try {
			await api.idpManagement.updateIdentity(identity.idTag, { dyndns: newValue })
			setDyndns(newValue)
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			}
			// Revert on error
			setDyndns(!newValue)
		} finally {
			setUpdatingDyndns(false)
		}
	}

	if (!identity) return null

	const info = [
		{ term: t('Email'), description: identity.email || t('Not set') },
		{
			term: t('Address'),
			description: identity.address ? (
				<CodeBlock inline>{identity.address}</CodeBlock>
			) : (
				<Text emphasis="muted">{t('Not configured')}</Text>
			)
		},
		{ term: t('Created'), description: formatDateTime(identity.createdAt) },
		...(identity.expiresAt
			? [{ term: t('Expires'), description: formatDateTime(identity.expiresAt) }]
			: [])
	]

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="md"
			title={identity.idTag}
			description={<StatusBadge status={identity.status} />}
			footer={
				<ActionBar
					start={
						<Button
							color="error"
							icon={<IcDelete />}
							onClick={() => onDelete(identity)}
						>
							{t('Delete Identity')}
						</Button>
					}
				>
					<Button onClick={onClose}>{t('Close')}</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && <Alert color="error">{error}</Alert>}

				<Panel title={t('Identity Information')} padding={2}>
					<VBox gap={2}>
						<DescriptionList items={info} />
						<Toggle
							label={dyndns ? t('Dynamic DNS (60s TTL)') : t('Standard (1 hour TTL)')}
							description={t(
								'Enable Dynamic DNS for identities with changing IP addresses.'
							)}
							checked={dyndns}
							disabled={updatingDyndns}
							onChange={(e) => handleDyndnsChange(e.target.checked)}
						/>
					</VBox>
				</Panel>

				<Panel
					title={t('API Keys')}
					padding={2}
					actions={
						!showCreateKeyForm && (
							<Button
								size="sm"
								icon={<IcPlus />}
								onClick={() => setShowCreateKeyForm(true)}
							>
								{t('Create Key')}
							</Button>
						)
					}
				>
					<VBox gap={2}>
						{showCreateKeyForm && (
							<VBox gap={2}>
								<Field label={t('Key Name (optional)')}>
									<Input
										placeholder={t('e.g., Home server')}
										value={keyName}
										onChange={(e) => setKeyName(e.target.value)}
									/>
								</Field>
								<ActionBar>
									<Button size="sm" onClick={() => setShowCreateKeyForm(false)}>
										{t('Cancel')}
									</Button>
									<Button
										color="primary"
										size="sm"
										loading={creatingKey}
										onClick={handleCreateApiKey}
									>
										{t('Create')}
									</Button>
								</ActionBar>
							</VBox>
						)}

						{loading ? (
							<LoadingSpinner label={t('Loading...')} />
						) : apiKeys.length === 0 ? (
							<Text size="sm" emphasis="muted">
								{t('No API keys. Create one for programmatic access.')}
							</Text>
						) : (
							<List variant="divided">
								{apiKeys.map((key) => (
									<ListItem
										key={key.id}
										leading={<IcKey />}
										title={key.name || t('Unnamed key')}
										subtitle={
											<>
												<CodeBlock
													inline
												>{`${key.keyPrefix}...`}</CodeBlock>
												{key.lastUsedAt &&
													` · ${t('Last used {{date}}', {
														date: formatRelative(key.lastUsedAt)
													})}`}
											</>
										}
										actions={
											<Button
												variant="ghost"
												color="error"
												icon={<IcDelete />}
												aria-label={t('Revoke key')}
												onClick={() => handleRevoke(key)}
											/>
										}
									/>
								))}
							</List>
						)}
					</VBox>
				</Panel>
			</VBox>
		</Dialog>
	)
}

// Main IdentitiesSettings component
export function IdentitiesSettings() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const dialog = useDialog()
	const { getClientFor } = useApiContext()
	const contextRoles = useAtomValue(contextRolesAtom)

	// State - all identities (unfiltered)
	const [allIdentities, setAllIdentities] = React.useState<IdpIdentity[]>([])
	const [loading, setLoading] = React.useState(true)
	const [search, setSearch] = React.useState('')
	const [debouncedSearch, setDebouncedSearch] = React.useState('')
	const [statusFilter, setStatusFilter] = React.useState<string | undefined>()
	const [roles, setRoles] = React.useState<string[]>([])
	const [rolesLoading, setRolesLoading] = React.useState(true)

	// Modal state
	const [showCreateModal, setShowCreateModal] = React.useState(false)
	const [showApiKeyModal, setShowApiKeyModal] = React.useState(false)
	const [showDetailsModal, setShowDetailsModal] = React.useState(false)
	const [showStandaloneKeyModal, setShowStandaloneKeyModal] = React.useState(false)
	const [selectedIdentity, setSelectedIdentity] = React.useState<IdpIdentity | null>(null)
	const [createdApiKey, setCreatedApiKey] = React.useState<IdpCreateApiKeyResult | null>(null)

	// The IDP domain is the tenant the route names — never the '~' URL shorthand, so
	// downstream uses (proxy token request, owner check, curl examples) get a real
	// domain. Identities managed by this IDP have id_tags like "alice.home.w9.hu".
	const ctx = useCtx()
	const idpDomain = ctx.idTag ?? auth?.idTag ?? ''

	// Use the context-bound API client so calls hit the correct tenant's
	// server (with the per-context proxy token), not always the user's own.
	// `contextRoles` is the re-render signal for that token's arrival, not a
	// value read here: without it a null resolved before the token lands is
	// frozen for the whole mount and the roles effect below never fires.
	const api = React.useMemo(
		() => getClientFor(idpDomain),
		[getClientFor, idpDomain, contextRoles]
	)

	// Check roles
	React.useEffect(() => {
		if (!api) return
		// On the home route the tenant behind `~` is only known once the node's own
		// idTag has landed. Skip the fetch until then instead of sending a bad path.
		if (!idpDomain) return
		setRolesLoading(true)
		api.auth
			.getProxyToken(idpDomain)
			.then((res) => {
				setRoles(res.roles || [])
			})
			.catch((err) => {
				console.error('Failed to get roles:', err)
				setRoles([])
			})
			.finally(() => {
				setRolesLoading(false)
			})
	}, [api, idpDomain])

	// Profile owner: the authenticated user IS the IDP. The 'leader' role
	// is a community-only concept; an IDP owner has implicit full access
	// to identities they themselves issue. For foreign IDP pages, fall
	// back to the explicit 'leader' role from the proxy token.
	const isOwner = !!auth?.idTag && auth.idTag === idpDomain
	const isLeader = isOwner || roles.includes('leader')

	// Load all identities once
	const loadIdentities = React.useCallback(async () => {
		if (!api) return
		setLoading(true)
		try {
			const result = await api.idpManagement.listIdentities({})
			setAllIdentities(result)
		} catch (err) {
			console.error('Failed to load identities:', err)
		} finally {
			setLoading(false)
		}
	}, [api])

	// Initial load when leader status is known
	React.useEffect(() => {
		if (isLeader && !rolesLoading) {
			loadIdentities()
		}
	}, [isLeader, rolesLoading, loadIdentities])

	// Filter identities client-side
	const identities = React.useMemo(() => {
		let filtered = allIdentities
		// Apply status filter
		if (statusFilter) {
			filtered = filtered.filter((id) => id.status === statusFilter)
		}
		// Apply search filter (name or email)
		if (debouncedSearch) {
			const q = debouncedSearch.toLowerCase()
			filtered = filtered.filter(
				(id) => id.idTag.toLowerCase().includes(q) || id.email?.toLowerCase().includes(q)
			)
		}
		return filtered
	}, [allIdentities, statusFilter, debouncedSearch])

	// Handle identity creation
	function handleIdentityCreated(result: IdpCreateIdentityResult) {
		// Result is the identity directly (with optional apiKey field)
		setAllIdentities((prev) => [result, ...prev])
		setSelectedIdentity(result)
		if (result.apiKey) {
			// Create a mock ApiKeyResult for the modal
			setCreatedApiKey({
				apiKey: {
					id: 0,
					idTag: result.idTag,
					keyPrefix: result.apiKey.substring(0, 8),
					createdAt: new Date().toISOString()
				},
				plaintextKey: result.apiKey
			})
			setShowApiKeyModal(true)
		}
	}

	// Handle API key created from details modal
	function handleApiKeyCreatedFromDetails(apiKey: IdpCreateApiKeyResult) {
		setCreatedApiKey(apiKey)
		setShowStandaloneKeyModal(true)
	}

	// Handle view details
	function handleViewDetails(identity: IdpIdentity) {
		setSelectedIdentity(identity)
		setShowDetailsModal(true)
	}

	// Handle delete identity — irreversible identity loss, so a typed-phrase confirm
	async function handleDeleteIdentity(identity: IdpIdentity) {
		const idTag = identity.idTag
		const confirmed = await dialog.confirm(
			t('Delete {{identity}}?', { identity: idTag }),
			t(
				'This will permanently delete this identity and all associated API keys. Users will lose access. This action cannot be undone.'
			),
			{ color: 'error', confirmLabel: t('Delete'), requireText: 'DELETE' }
		)
		if (!confirmed) return

		try {
			await api!.idpManagement.deleteIdentity(identity.idTag)
			setAllIdentities((prev) => prev.filter((i) => i.idTag !== identity.idTag))
			setShowDetailsModal(false)
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message)
			}
		}
	}

	// Count identities by status (from all identities, not filtered)
	const counts = React.useMemo(() => {
		const c = { active: 0, pending: 0, suspended: 0 }
		for (const id of allIdentities) {
			if (id.status in c) {
				c[id.status as keyof typeof c]++
			}
		}
		return c
	}, [allIdentities])

	// Loading roles
	if (rolesLoading) {
		return <LoadingSpinner className="auto-bg" label={t('Loading...')} />
	}

	// Access denied
	if (!isLeader) {
		return (
			<EmptyState
				className="auto-bg"
				description={t('You need leader permissions to manage identities.')}
			/>
		)
	}

	return (
		<VBox gap={3}>
			{/* Search and filter bar */}
			<Panel padding={2}>
				<VBox gap={2}>
					<HBox gap={2}>
						<SearchInput
							className="flex-fill"
							placeholder={t('Search by name or email...')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onSearch={setDebouncedSearch}
							debounce={300}
							aria-label={t('Search identities')}
						/>
						<Button
							color="primary"
							icon={<IcPlus />}
							onClick={() => setShowCreateModal(true)}
						>
							{t('Create')}
						</Button>
					</HBox>

					{/* Status filter */}
					<Segmented
						aria-label={t('Status')}
						value={statusFilter ?? ''}
						onChange={(value) => setStatusFilter(value || undefined)}
					>
						<SegmentedItem value="">
							{t('All')} ({allIdentities.length})
						</SegmentedItem>
						<SegmentedItem value="active">
							{t('Active')} ({counts.active})
						</SegmentedItem>
						<SegmentedItem value="pending">
							{t('Pending')} ({counts.pending})
						</SegmentedItem>
						<SegmentedItem value="suspended">
							{t('Suspended')} ({counts.suspended})
						</SegmentedItem>
					</Segmented>
				</VBox>
			</Panel>

			{/* Identity list */}
			{loading ? (
				<LoadingSpinner className="auto-bg" label={t('Loading identities...')} />
			) : identities.length === 0 ? (
				search || statusFilter ? (
					<EmptyState
						className="auto-bg"
						icon={<IcSearch />}
						description={
							search
								? t('No identities matching "{{query}}"', { query: search })
								: t('No {{status}} identities', { status: statusFilter })
						}
						actions={
							<Button
								variant="link"
								onClick={() => {
									setSearch('')
									setDebouncedSearch('')
									setStatusFilter(undefined)
								}}
							>
								{t('Clear filters')}
							</Button>
						}
					/>
				) : (
					<EmptyState
						className="auto-bg"
						icon={<IcUsers />}
						title={t('No identities yet')}
						description={t('Create your first identity to get started.')}
						actions={
							<Button
								color="primary"
								icon={<IcPlus />}
								onClick={() => setShowCreateModal(true)}
							>
								{t('Create Identity')}
							</Button>
						}
					/>
				)
			) : (
				<List variant="bordered">
					{identities.map((identity) => (
						<IdentityRow
							key={identity.idTag}
							identity={identity}
							onViewDetails={handleViewDetails}
							onDelete={handleDeleteIdentity}
						/>
					))}
				</List>
			)}

			{/* Dialogs */}
			<CreateIdentityModal
				open={showCreateModal}
				idpDomain={idpDomain}
				onClose={() => setShowCreateModal(false)}
				onCreated={handleIdentityCreated}
			/>

			<ApiKeyDialog
				open={showApiKeyModal}
				identity={selectedIdentity}
				apiKey={createdApiKey}
				idpDomain={idpDomain}
				identityCreated
				onClose={() => {
					setShowApiKeyModal(false)
					setCreatedApiKey(null)
				}}
			/>

			<IdentityDetailsModal
				open={showDetailsModal}
				identity={selectedIdentity}
				idpDomain={idpDomain}
				onClose={() => {
					setShowDetailsModal(false)
					setSelectedIdentity(null)
				}}
				onDelete={handleDeleteIdentity}
				onApiKeyCreated={handleApiKeyCreatedFromDetails}
			/>

			<ApiKeyDialog
				open={showStandaloneKeyModal}
				identity={selectedIdentity}
				apiKey={createdApiKey}
				idpDomain={idpDomain}
				onClose={() => {
					setShowStandaloneKeyModal(false)
					setCreatedApiKey(null)
				}}
			/>
		</VBox>
	)
}

// vim: ts=4
