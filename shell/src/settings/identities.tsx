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
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

import {
	LuSearch as IcSearch,
	LuPlus as IcPlus,
	LuTrash as IcDelete,
	LuKey as IcKey,
	LuCopy as IcCopy,
	LuCheck as IcCheck,
	LuX as IcClose,
	LuTriangleAlert as IcWarning,
	LuEye as IcDetails,
	LuUsers as IcUsers,
	LuCircle as IcCircle,
	LuCircleDot as IcCircleDot,
	LuBan as IcBan
} from 'react-icons/lu'

import type {
	IdpIdentity,
	IdpApiKey,
	IdpCreateApiKeyResult,
	IdpCreateIdentityResult
} from '@cloudillo/base'
import { useAuth, useApi, useDialog, Button, Modal, mergeClasses } from '@cloudillo/react'

// Status badge configuration
const STATUS_CONFIG = {
	active: { class: 'c-badge success', icon: IcCircleDot, label: 'Active' },
	pending: { class: 'c-badge warning', icon: IcCircle, label: 'Pending' },
	suspended: { class: 'c-badge error', icon: IcBan, label: 'Suspended' }
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
		<span className={config.class}>
			<Icon className="mr-1" style={{ fontSize: '0.8em' }} />
			{t(config.label)}
		</span>
	)
}

// Identity card component
interface IdentityCardProps {
	identity: IdpIdentity
	onViewDetails: (identity: IdpIdentity) => void
	onDelete: (identity: IdpIdentity) => void
}

function IdentityCard({ identity, onViewDetails, onDelete }: IdentityCardProps) {
	const { t } = useTranslation()
	const idTag = identity.idTag

	return (
		<div className="c-panel mb-2 p-2">
			<div className="c-hbox ai-center">
				<div className="flex-fill">
					<div className="c-hbox ai-center g-2 mb-1">
						<StatusBadge status={identity.status} />
						<strong>{idTag}</strong>
					</div>
					<div className="c-hint small">
						{identity.email && <span>{identity.email} &middot; </span>}
						{t('Created {{date}}', { date: formatDate(identity.createdAt) })}
						{identity.expiresAt && (
							<span>
								{' '}
								&middot;{' '}
								{t('Expires {{date}}', { date: formatDate(identity.expiresAt) })}
							</span>
						)}
					</div>
				</div>
				<div className="c-hbox g-1">
					<Button link onClick={() => onViewDetails(identity)} title={t('View details')}>
						<IcDetails />
					</Button>
					<Button
						link
						className="text-error"
						onClick={() => onDelete(identity)}
						title={t('Delete identity')}
					>
						<IcDelete />
					</Button>
				</div>
			</div>
		</div>
	)
}

// Filter chip component
interface FilterChipProps {
	active: boolean
	onClick: () => void
	children: React.ReactNode
}

function FilterChip({ active, onClick, children }: FilterChipProps) {
	return (
		<button
			className={mergeClasses('c-badge clickable', active ? 'primary' : '')}
			onClick={onClick}
		>
			{children}
		</button>
	)
}

// Create Identity Modal
interface CreateIdentityModalProps {
	open: boolean
	idpDomain: string
	onClose: () => void
	onCreated: (result: IdpCreateIdentityResult) => void
}

function CreateIdentityModal({ open, idpDomain, onClose, onCreated }: CreateIdentityModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [idTagPrefix, setIdTagPrefix] = React.useState('')
	const [email, setEmail] = React.useState('')
	const [createApiKey, setCreateApiKey] = React.useState(false)
	const [apiKeyName, setApiKeyName] = React.useState('')
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [nameError, setNameError] = React.useState<string | undefined>()
	const [emailError, setEmailError] = React.useState<string | undefined>()

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
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '500px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<h3 className="flex-fill mb-0">{t('Create New Identity')}</h3>
					<button className="c-link" onClick={onClose} aria-label={t('Close')}>
						<IcClose />
					</button>
				</div>

				{error && (
					<div className="c-panel bg-error-subtle p-2 mb-3">
						<span className="text-error">{error}</span>
					</div>
				)}

				{/* Identity name field */}
				<div className="mb-3">
					<label className="c-label">
						{t('Identity Name')} <span className="text-error">*</span>
					</label>
					<div className="c-hbox">
						<input
							className={mergeClasses('c-input flex-fill', nameError && 'error')}
							placeholder="alice"
							value={idTagPrefix}
							onChange={(e) => setIdTagPrefix(e.target.value.toLowerCase())}
							onBlur={validateName}
							aria-invalid={!!nameError}
						/>
						<span className="c-input-suffix px-2">.{idpDomain}</span>
					</div>
					<div className="c-hint small mt-1">
						{nameError ? (
							<span className="text-error">{nameError}</span>
						) : (
							t('Letters, numbers, and hyphens. 3-32 characters.')
						)}
					</div>
				</div>

				{/* Email field */}
				<div className="mb-3">
					<label className="c-label">
						{t('Owner Email')} <span className="text-error">*</span>
					</label>
					<input
						className={mergeClasses('c-input', emailError && 'error')}
						type="email"
						placeholder="alice@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						onBlur={validateEmail}
						aria-invalid={!!emailError}
					/>
					{emailError && <div className="c-hint small text-error mt-1">{emailError}</div>}
					<div className="c-hint small mt-1">
						{t('An activation link will be sent to this address.')}
					</div>
				</div>

				{/* API key toggle */}
				<div className="c-panel bg-muted p-2 mb-3">
					<label className="c-hbox ai-start">
						<input
							type="checkbox"
							className="c-toggle primary mr-2 mt-1"
							checked={createApiKey}
							onChange={(e) => setCreateApiKey(e.target.checked)}
						/>
						<div>
							<span>{t('Create API key')}</span>
							<div className="c-hint small">
								{t(
									'Generate an API key for programmatic access (e.g., dynamic DNS updates).'
								)}
							</div>
						</div>
					</label>

					{createApiKey && (
						<div className="mt-2">
							<label className="c-label">{t('Key Name (optional)')}</label>
							<input
								className="c-input"
								placeholder={t('e.g., Home server DynDNS')}
								value={apiKeyName}
								onChange={(e) => setApiKeyName(e.target.value)}
							/>
						</div>
					)}
				</div>

				{/* Actions */}
				<div className="c-hbox jc-end g-2">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button primary disabled={!isValid || isSubmitting} onClick={handleCreate}>
						{isSubmitting ? t('Creating...') : t('Create Identity')}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// API Key Created Modal
interface ApiKeyCreatedModalProps {
	open: boolean
	identity: IdpIdentity | null
	apiKey: IdpCreateApiKeyResult | null
	idpDomain: string
	onClose: () => void
}

function ApiKeyCreatedModal({
	open,
	identity,
	apiKey,
	idpDomain,
	onClose
}: ApiKeyCreatedModalProps) {
	const { t } = useTranslation()
	const [copied, setCopied] = React.useState<'key' | 'curl' | null>(null)

	async function copyToClipboard(text: string, type: 'key' | 'curl') {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(type)
			setTimeout(() => setCopied(null), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	if (!identity || !apiKey) return null

	const idTag = identity.idTag
	const idPrefix = idTag.split('.')[0]
	const curlCommand = `curl -X PUT "https://cl-o.${idpDomain}/api/idp/identities/${idPrefix}/address" \\
  -H "Authorization: Bearer ${apiKey.plaintextKey}"`

	return (
		<Modal open={open} onClose={onClose} closeOnBackdrop={false}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '600px', width: '100%' }}>
				<div className="c-hbox ai-center mb-3">
					<IcCheck className="text-success mr-2" style={{ fontSize: '1.5rem' }} />
					<h3 className="flex-fill mb-0">{t('Identity Created Successfully')}</h3>
				</div>

				{/* Success message */}
				<div className="c-panel bg-success-subtle p-2 mb-3">
					<p className="mb-0">
						{t(
							'{{identity}} has been created. An activation email has been sent to {{email}}.',
							{
								identity: idTag,
								email: identity.email
							}
						)}
					</p>
				</div>

				{/* Warning */}
				<div className="c-panel bg-warning-subtle p-2 mb-3">
					<div className="c-hbox ai-start">
						<IcWarning className="text-warning mr-2 mt-1 flex-shrink-0" />
						<div>
							<strong>{t('Save this API key now!')}</strong>
							<p className="c-hint mb-0">
								{t('This key will only be shown once. Store it securely.')}
							</p>
						</div>
					</div>
				</div>

				{/* API Key */}
				<div className="mb-3">
					<label className="c-label">{t('API Key')}</label>
					<div className="c-hbox g-1">
						<code
							className="c-code flex-fill p-2"
							style={{ wordBreak: 'break-all', userSelect: 'all' }}
						>
							{apiKey.plaintextKey}
						</code>
						<Button
							onClick={() => copyToClipboard(apiKey.plaintextKey, 'key')}
							title={t('Copy API key')}
						>
							{copied === 'key' ? <IcCheck /> : <IcCopy />}
						</Button>
					</div>
				</div>

				{/* Curl command */}
				<div className="mb-3">
					<div className="c-hbox jc-between ai-center mb-1">
						<label className="c-label mb-0">{t('Example: Update IP Address')}</label>
						<Button
							link
							className="small"
							onClick={() => copyToClipboard(curlCommand, 'curl')}
						>
							{copied === 'curl' ? (
								<>
									<IcCheck className="mr-1" />
									{t('Copied!')}
								</>
							) : (
								<>
									<IcCopy className="mr-1" />
									{t('Copy command')}
								</>
							)}
						</Button>
					</div>
					<pre
						className="c-code p-2 overflow-x-auto mb-1"
						style={{ whiteSpace: 'pre-wrap', fontSize: '0.85em' }}
					>
						{curlCommand}
					</pre>
					<div className="c-hint small">
						{t('Updates the IP address automatically from the client IP.')}
					</div>
				</div>

				{/* Close button */}
				<div className="c-hbox jc-end">
					<Button primary onClick={onClose}>
						{t("I've saved the key")}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// Identity Details Modal
interface IdentityDetailsModalProps {
	open: boolean
	identity: IdpIdentity | null
	onClose: () => void
	onDelete: (identity: IdpIdentity) => void
	onApiKeyCreated: (apiKey: IdpCreateApiKeyResult) => void
}

function IdentityDetailsModal({
	open,
	identity,
	onClose,
	onDelete,
	onApiKeyCreated
}: IdentityDetailsModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [apiKeys, setApiKeys] = React.useState<IdpApiKey[]>([])
	const [loading, setLoading] = React.useState(false)
	const [showCreateKeyForm, setShowCreateKeyForm] = React.useState(false)
	const [keyName, setKeyName] = React.useState('')
	const [creatingKey, setCreatingKey] = React.useState(false)
	const [confirmRevokeKeyId, setConfirmRevokeKeyId] = React.useState<number | null>(null)
	const [revokingKey, setRevokingKey] = React.useState(false)
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
			setConfirmRevokeKeyId(null)
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

	async function handleConfirmRevoke(key: IdpApiKey) {
		if (!api || !identity) return
		setRevokingKey(true)
		setError(null)
		try {
			await api.idpManagement.deleteApiKey(key.id, identity.idTag)
			setConfirmRevokeKeyId(null)
			await loadApiKeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			}
		} finally {
			setRevokingKey(false)
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

	const idTag = identity.idTag

	return (
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '550px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<div className="flex-fill">
						<h3 className="mb-1">{idTag}</h3>
						<StatusBadge status={identity.status} />
					</div>
					<button className="c-link" onClick={onClose} aria-label={t('Close')}>
						<IcClose />
					</button>
				</div>

				{/* Identity Information */}
				<div className="c-panel mb-3 p-2">
					<h4 className="pb-2">{t('Identity Information')}</h4>
					<div className="c-vbox g-1">
						<div className="c-hbox">
							<span className="text-muted" style={{ minWidth: '100px' }}>
								{t('Email')}
							</span>
							<span>{identity.email || t('Not set')}</span>
						</div>
						<div className="c-hbox">
							<span className="text-muted" style={{ minWidth: '100px' }}>
								{t('Address')}
							</span>
							<span>
								{identity.address ? (
									<code>{identity.address}</code>
								) : (
									<span className="text-muted">{t('Not configured')}</span>
								)}
							</span>
						</div>
						<div className="c-hbox">
							<span className="text-muted" style={{ minWidth: '100px' }}>
								{t('Created')}
							</span>
							<span>{formatDateTime(identity.createdAt)}</span>
						</div>
						{identity.expiresAt && (
							<div className="c-hbox">
								<span className="text-muted" style={{ minWidth: '100px' }}>
									{t('Expires')}
								</span>
								<span>{formatDateTime(identity.expiresAt)}</span>
							</div>
						)}
						<div className="c-hbox ai-center mt-2 pt-2 border-top">
							<span className="text-muted" style={{ minWidth: '100px' }}>
								{t('DNS TTL')}
							</span>
							<label className="c-hbox ai-center flex-fill">
								<input
									type="checkbox"
									className="c-toggle primary mr-2"
									checked={dyndns}
									disabled={updatingDyndns}
									onChange={(e) => handleDyndnsChange(e.target.checked)}
								/>
								<span className={dyndns ? '' : 'text-muted'}>
									{dyndns
										? t('Dynamic DNS (60s TTL)')
										: t('Standard (1 hour TTL)')}
								</span>
							</label>
						</div>
						<div className="c-hint small mt-1">
							{t('Enable Dynamic DNS for identities with changing IP addresses.')}
						</div>
					</div>
				</div>

				{/* API Keys Section */}
				<div className="c-panel mb-3 p-2">
					<div className="c-hbox jc-between ai-center pb-2">
						<h4 className="mb-0">{t('API Keys')}</h4>
						{!showCreateKeyForm && (
							<Button className="small" onClick={() => setShowCreateKeyForm(true)}>
								<IcPlus className="mr-1" />
								{t('Create Key')}
							</Button>
						)}
					</div>

					{showCreateKeyForm && (
						<div className="c-panel bg-muted p-2 mb-2">
							<label className="c-label">{t('Key Name (optional)')}</label>
							<input
								className="c-input mb-2"
								placeholder={t('e.g., Home server')}
								value={keyName}
								onChange={(e) => setKeyName(e.target.value)}
							/>
							<div className="c-hbox g-2 jc-end">
								<Button
									className="small"
									onClick={() => setShowCreateKeyForm(false)}
								>
									{t('Cancel')}
								</Button>
								<Button
									primary
									className="small"
									disabled={creatingKey}
									onClick={handleCreateApiKey}
								>
									{creatingKey ? t('Creating...') : t('Create')}
								</Button>
							</div>
						</div>
					)}

					{error && (
						<div className="c-panel bg-error-subtle p-2 mb-2">
							<span className="text-error small">{error}</span>
						</div>
					)}

					{loading ? (
						<p className="c-hint">{t('Loading...')}</p>
					) : apiKeys.length === 0 ? (
						<p className="c-hint">
							{t('No API keys. Create one for programmatic access.')}
						</p>
					) : (
						<div>
							{apiKeys.map((key) => (
								<div key={key.id} className="py-2 border-bottom">
									{confirmRevokeKeyId === key.id ? (
										<div className="c-panel bg-error-subtle p-2">
											<p className="small mb-2">
												{t('Revoke this API key? This cannot be undone.')}
											</p>
											<div className="c-hbox g-2 jc-end">
												<Button
													className="small"
													onClick={() => setConfirmRevokeKeyId(null)}
													disabled={revokingKey}
												>
													{t('Cancel')}
												</Button>
												<Button
													primary
													className="small bg-error"
													onClick={() => handleConfirmRevoke(key)}
													disabled={revokingKey}
												>
													{revokingKey ? t('Revoking...') : t('Revoke')}
												</Button>
											</div>
										</div>
									) : (
										<div className="c-hbox ai-center">
											<IcKey className="mr-2 text-muted" />
											<div className="flex-fill">
												<div>{key.name || t('Unnamed key')}</div>
												<div className="c-hint small">
													<code>{key.keyPrefix}...</code>
													{key.lastUsedAt && (
														<span className="ml-2">
															{t('Last used {{date}}', {
																date: formatRelative(key.lastUsedAt)
															})}
														</span>
													)}
												</div>
											</div>
											<Button
												link
												className="text-error"
												onClick={() => setConfirmRevokeKeyId(key.id)}
												title={t('Revoke key')}
											>
												<IcDelete />
											</Button>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>

				{/* Footer actions */}
				<div className="c-hbox jc-between">
					<Button className="text-error" onClick={() => onDelete(identity)}>
						<IcDelete className="mr-1" />
						{t('Delete Identity')}
					</Button>
					<Button onClick={onClose}>{t('Close')}</Button>
				</div>
			</div>
		</Modal>
	)
}

// Standalone API Key Modal (when created from details)
interface StandaloneApiKeyModalProps {
	open: boolean
	identity: IdpIdentity | null
	apiKey: IdpCreateApiKeyResult | null
	idpDomain: string
	onClose: () => void
}

function StandaloneApiKeyModal({
	open,
	identity,
	apiKey,
	idpDomain,
	onClose
}: StandaloneApiKeyModalProps) {
	const { t } = useTranslation()
	const [copied, setCopied] = React.useState<'key' | 'curl' | null>(null)

	async function copyToClipboard(text: string, type: 'key' | 'curl') {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(type)
			setTimeout(() => setCopied(null), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	if (!identity || !apiKey) return null

	const idTag = identity.idTag
	const idPrefix = idTag.split('.')[0]
	const curlCommand = `curl -X PUT "https://cl-o.${idpDomain}/api/idp/identities/${idPrefix}/address" \\
  -H "Authorization: Bearer ${apiKey.plaintextKey}"`

	return (
		<Modal open={open} onClose={onClose} closeOnBackdrop={false}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '600px', width: '100%' }}>
				<div className="c-hbox ai-center mb-3">
					<IcKey className="text-primary mr-2" style={{ fontSize: '1.5rem' }} />
					<h3 className="flex-fill mb-0">{t('API Key Created')}</h3>
				</div>

				{/* Warning */}
				<div className="c-panel bg-warning-subtle p-2 mb-3">
					<div className="c-hbox ai-start">
						<IcWarning className="text-warning mr-2 mt-1 flex-shrink-0" />
						<div>
							<strong>{t('Save this API key now!')}</strong>
							<p className="c-hint mb-0">
								{t('This key will only be shown once. Store it securely.')}
							</p>
						</div>
					</div>
				</div>

				{/* API Key */}
				<div className="mb-3">
					<label className="c-label">{t('API Key')}</label>
					<div className="c-hbox g-1">
						<code
							className="c-code flex-fill p-2"
							style={{ wordBreak: 'break-all', userSelect: 'all' }}
						>
							{apiKey.plaintextKey}
						</code>
						<Button
							onClick={() => copyToClipboard(apiKey.plaintextKey, 'key')}
							title={t('Copy API key')}
						>
							{copied === 'key' ? <IcCheck /> : <IcCopy />}
						</Button>
					</div>
				</div>

				{/* Curl command */}
				<div className="mb-3">
					<div className="c-hbox jc-between ai-center mb-1">
						<label className="c-label mb-0">{t('Example: Update IP Address')}</label>
						<Button
							link
							className="small"
							onClick={() => copyToClipboard(curlCommand, 'curl')}
						>
							{copied === 'curl' ? (
								<>
									<IcCheck className="mr-1" />
									{t('Copied!')}
								</>
							) : (
								<>
									<IcCopy className="mr-1" />
									{t('Copy command')}
								</>
							)}
						</Button>
					</div>
					<pre
						className="c-code p-2 overflow-x-auto mb-1"
						style={{ whiteSpace: 'pre-wrap', fontSize: '0.85em' }}
					>
						{curlCommand}
					</pre>
					<div className="c-hint small">
						{t('Updates the IP address automatically from the client IP.')}
					</div>
				</div>

				{/* Close button */}
				<div className="c-hbox jc-end">
					<Button primary onClick={onClose}>
						{t("I've saved the key")}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// Main IdentitiesSettings component
export function IdentitiesSettings() {
	const { t } = useTranslation()
	const params = useParams()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()

	// State
	const [identities, setIdentities] = React.useState<IdpIdentity[]>([])
	const [loading, setLoading] = React.useState(true)
	const [search, setSearch] = React.useState('')
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

	const contextIdTag = params.contextIdTag!
	// The IDP domain is the contextIdTag itself (e.g., "home.w9.hu")
	// Identities managed by this IDP have id_tags like "alice.home.w9.hu"
	const idpDomain = contextIdTag

	// Check roles
	React.useEffect(() => {
		if (!api) return
		setRolesLoading(true)
		api.auth
			.getProxyToken(contextIdTag)
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
	}, [api, contextIdTag])

	const isLeader = roles.includes('leader')

	// Load identities
	const loadIdentities = React.useCallback(async () => {
		if (!api) return
		setLoading(true)
		try {
			const query: { q?: string; status?: string } = {}
			if (search) query.q = search
			if (statusFilter) query.status = statusFilter
			const result = await api.idpManagement.listIdentities(query)
			setIdentities(result)
		} catch (err) {
			console.error('Failed to load identities:', err)
		} finally {
			setLoading(false)
		}
	}, [api, search, statusFilter])

	// Debounced search
	React.useEffect(() => {
		const timer = setTimeout(() => {
			if (isLeader) {
				loadIdentities()
			}
		}, 300)
		return () => clearTimeout(timer)
	}, [search, statusFilter, isLeader, loadIdentities])

	// Initial load
	React.useEffect(() => {
		if (isLeader && !rolesLoading) {
			loadIdentities()
		}
	}, [isLeader, rolesLoading, loadIdentities])

	// Handle identity creation
	function handleIdentityCreated(result: IdpCreateIdentityResult) {
		// Result is the identity directly (with optional apiKey field)
		setIdentities((prev) => [result, ...prev])
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

	// Handle delete identity
	async function handleDeleteIdentity(identity: IdpIdentity) {
		const idTag = identity.idTag
		const confirmed = await dialog.confirm(
			t('Delete {{identity}}?', { identity: idTag }),
			t(
				'This will permanently delete this identity and all associated API keys. Users will lose access. This action cannot be undone.'
			)
		)
		if (!confirmed) return

		try {
			await api!.idpManagement.deleteIdentity(identity.idTag)
			setIdentities((prev) => prev.filter((i) => i.idTag !== identity.idTag))
			setShowDetailsModal(false)
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message)
			}
		}
	}

	// Count identities by status
	const counts = React.useMemo(() => {
		const c = { active: 0, pending: 0, suspended: 0 }
		for (const id of identities) {
			if (id.status in c) {
				c[id.status as keyof typeof c]++
			}
		}
		return c
	}, [identities])

	// Loading roles
	if (rolesLoading) {
		return (
			<div className="c-panel p-4">
				<p className="c-hint">{t('Loading...')}</p>
			</div>
		)
	}

	// Access denied
	if (!isLeader) {
		return (
			<div className="c-panel p-4">
				<p className="text-muted">
					{t('You need leader permissions to manage identities.')}
				</p>
			</div>
		)
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
							placeholder={t('Search by name or email...')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							aria-label={t('Search identities')}
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
						{t('All')} ({identities.length})
					</FilterChip>
					<FilterChip
						active={statusFilter === 'active'}
						onClick={() => setStatusFilter('active')}
					>
						{t('Active')} ({counts.active})
					</FilterChip>
					<FilterChip
						active={statusFilter === 'pending'}
						onClick={() => setStatusFilter('pending')}
					>
						{t('Pending')} ({counts.pending})
					</FilterChip>
					<FilterChip
						active={statusFilter === 'suspended'}
						onClick={() => setStatusFilter('suspended')}
					>
						{t('Suspended')} ({counts.suspended})
					</FilterChip>
				</div>
			</div>

			{/* Identity list */}
			{loading ? (
				<div className="c-panel p-4 text-center">
					<p className="c-hint">{t('Loading identities...')}</p>
				</div>
			) : identities.length === 0 ? (
				<div className="c-panel p-4 text-center">
					{search || statusFilter ? (
						<>
							<IcSearch className="text-muted mb-2" style={{ fontSize: '2rem' }} />
							<p className="c-hint">
								{search
									? t('No identities matching "{{query}}"', { query: search })
									: t('No {{status}} identities', { status: statusFilter })}
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
							<IcUsers className="text-muted mb-2" style={{ fontSize: '3rem' }} />
							<h4>{t('No identities yet')}</h4>
							<p className="c-hint mb-3">
								{t('Create your first identity to get started.')}
							</p>
							<Button primary onClick={() => setShowCreateModal(true)}>
								<IcPlus className="mr-1" />
								{t('Create Identity')}
							</Button>
						</>
					)}
				</div>
			) : (
				<div>
					{identities.map((identity) => (
						<IdentityCard
							key={identity.idTag}
							identity={identity}
							onViewDetails={handleViewDetails}
							onDelete={handleDeleteIdentity}
						/>
					))}
				</div>
			)}

			{/* Modals */}
			<CreateIdentityModal
				open={showCreateModal}
				idpDomain={idpDomain}
				onClose={() => setShowCreateModal(false)}
				onCreated={handleIdentityCreated}
			/>

			<ApiKeyCreatedModal
				open={showApiKeyModal}
				identity={selectedIdentity}
				apiKey={createdApiKey}
				idpDomain={idpDomain}
				onClose={() => {
					setShowApiKeyModal(false)
					setCreatedApiKey(null)
				}}
			/>

			<IdentityDetailsModal
				open={showDetailsModal}
				identity={selectedIdentity}
				onClose={() => {
					setShowDetailsModal(false)
					setSelectedIdentity(null)
				}}
				onDelete={handleDeleteIdentity}
				onApiKeyCreated={handleApiKeyCreatedFromDetails}
			/>

			<StandaloneApiKeyModal
				open={showStandaloneKeyModal}
				identity={selectedIdentity}
				apiKey={createdApiKey}
				idpDomain={idpDomain}
				onClose={() => {
					setShowStandaloneKeyModal(false)
					setCreatedApiKey(null)
				}}
			/>
		</>
	)
}

// vim: ts=4
