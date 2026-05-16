// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	type ApiKeyListItem,
	type CreateApiKeyResult,
	getInstanceUrl,
	type WebAuthnCredential
} from '@cloudillo/core'
import { Button, LoadingSpinner, Modal, useApi, useAuth, useDialog } from '@cloudillo/react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import type { TFunction } from 'i18next'
import * as React from 'react'

interface NavigatorUA {
	userAgentData?: { platform: string }
}
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuKey as IcApiKey,
	LuCheck as IcCheck,
	LuX as IcClose,
	LuCopy as IcCopy,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuFingerprint as IcPasskey,
	LuTriangleAlert as IcWarning
} from 'react-icons/lu'
import {
	deleteApiKey as swDeleteApiKey,
	getApiKey as swGetApiKey,
	setApiKey as swSetApiKey
} from '../pwa.js'
import { PasswordInput, PasswordStrengthBar } from '../components/PasswordInput.js'
import { useSettings } from './settings.js'

interface ScopeDef {
	value: string
	label: string
	description: string
}

const getAvailableScopes = (t: TFunction): ScopeDef[] => [
	{
		value: 'apkg:publish',
		label: t('App Package Publish'),
		description: t('Allows publishing app packages to the repository.')
	},
	{
		value: 'carddav:read',
		label: t('CardDAV (read)'),
		description: t('Read contacts via CardDAV (Apple Contacts, Thunderbird, DAVx⁵).')
	},
	{
		value: 'carddav:write',
		label: t('CardDAV (read/write)'),
		description: t('Read and modify contacts via CardDAV. Implies CardDAV (read).')
	},
	{
		value: 'caldav:read',
		label: t('CalDAV (read)'),
		description: t('Read calendars via CalDAV (Apple Calendar, Thunderbird, DAVx⁵).')
	},
	{
		value: 'caldav:write',
		label: t('CalDAV (read/write)'),
		description: t('Read and modify calendars via CalDAV. Implies CalDAV (read).')
	}
]

function scopeLabel(t: TFunction, scope: string): string {
	return getAvailableScopes(t).find((s) => s.value === scope)?.label ?? scope
}

// Create API Key Modal
interface CreateApiKeyModalProps {
	open: boolean
	onClose: () => void
	onCreated: (result: CreateApiKeyResult) => void
}

function CreateApiKeyModal({ open, onClose, onCreated }: CreateApiKeyModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const availableScopes = React.useMemo(() => getAvailableScopes(t), [t])
	const [name, setName] = React.useState('')
	const [selectedScopes, setSelectedScopes] = React.useState<string[]>([])
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open) {
			setName('')
			setSelectedScopes([])
			setError(undefined)
		}
	}, [open])

	function toggleScope(scope: string) {
		setSelectedScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
		)
	}

	async function handleCreate() {
		if (!api) return
		setIsSubmitting(true)
		setError(undefined)

		// Server-side, write access requires read in the same protocol family.
		// Auto-add the matching read scope so users don't have to think about it.
		const finalScopes = new Set(selectedScopes)
		if (finalScopes.has('carddav:write')) finalScopes.add('carddav:read')
		if (finalScopes.has('caldav:write')) finalScopes.add('caldav:read')

		try {
			const result = await api.auth.createApiKey({
				name: name || undefined,
				scopes: finalScopes.size > 0 ? Array.from(finalScopes).join(',') : undefined
			})
			onCreated(result)
			onClose()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			} else {
				setError(t('Failed to create API key'))
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '500px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<h3 className="flex-fill mb-0">{t('Create API Key')}</h3>
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
					<label className="c-label">{t('Name (optional)')}</label>
					<input
						className="c-input"
						placeholder={t('e.g., CI pipeline')}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				<div className="mb-3">
					<label className="c-label">{t('Permissions')}</label>
					<div className="c-hint small mb-2">
						{t('Leave all unchecked for full access.')}
					</div>
					{availableScopes.map((scope) => (
						<label key={scope.value} className="c-hbox ai-start p-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2 mt-1"
								checked={selectedScopes.includes(scope.value)}
								onChange={() => toggleScope(scope.value)}
							/>
							<div>
								<span>{scope.label}</span>
								<div className="c-hint small">{scope.description}</div>
							</div>
						</label>
					))}
				</div>

				<div className="c-hbox jc-end g-2">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button variant="primary" disabled={isSubmitting} onClick={handleCreate}>
						{isSubmitting ? t('Creating...') : t('Create API Key')}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// Edit API Key Modal
interface EditApiKeyModalProps {
	open: boolean
	apiKey: ApiKeyListItem | undefined
	onClose: () => void
	onSaved: () => void
}

// Convert Unix seconds → "YYYY-MM-DD" in the user's local timezone for <input type="date">.
function expiresAtToDateInput(expiresAt: number | undefined): string {
	if (!expiresAt) return ''
	const d = new Date(expiresAt * 1000)
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

// Convert "YYYY-MM-DD" → Unix seconds at end-of-day in the user's *local*
// timezone. This matches the UX of "valid through this date where I am";
// near the international date line the resulting instant can land on a
// different UTC calendar day, which is acceptable as long as the server
// compares against the timestamp (not a UTC calendar date).
function dateInputToExpiresAt(value: string): number | null {
	if (!value) return null
	const endOfDay = new Date(`${value}T23:59:59`)
	return Math.floor(endOfDay.getTime() / 1000)
}

function EditApiKeyModal({ open, apiKey, onClose, onSaved }: EditApiKeyModalProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const availableScopes = React.useMemo(() => getAvailableScopes(t), [t])
	const [name, setName] = React.useState('')
	const [selectedScopes, setSelectedScopes] = React.useState<string[]>([])
	const [expiresAtInput, setExpiresAtInput] = React.useState('')
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()

	React.useEffect(() => {
		if (open && apiKey) {
			setName(apiKey.name ?? '')
			setSelectedScopes(apiKey.scopes?.split(',').filter(Boolean) ?? [])
			setExpiresAtInput(expiresAtToDateInput(apiKey.expiresAt))
			setError(undefined)
		}
	}, [open, apiKey])

	function toggleScope(scope: string) {
		setSelectedScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
		)
	}

	async function handleSave() {
		if (!api || !apiKey) return
		setIsSubmitting(true)
		setError(undefined)

		// Server-side, write access requires read in the same protocol family.
		// Auto-add the matching read scope so users don't have to think about it.
		const finalScopes = new Set(selectedScopes)
		if (finalScopes.has('carddav:write')) finalScopes.add('carddav:read')
		if (finalScopes.has('caldav:write')) finalScopes.add('caldav:read')

		// Only send expiresAt if the date part changed — avoids overwriting the
		// original second-precision timestamp when the user didn't touch the field.
		const originalInput = expiresAtToDateInput(apiKey.expiresAt)
		const expiresAtChanged = expiresAtInput !== originalInput

		try {
			await api.auth.updateApiKey(apiKey.keyId, {
				name: name || null,
				scopes: finalScopes.size > 0 ? Array.from(finalScopes).join(',') : null,
				...(expiresAtChanged && { expiresAt: dateInputToExpiresAt(expiresAtInput) })
			})
			onSaved()
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message)
			} else {
				setError(t('Failed to update API key'))
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Modal open={open} onClose={onClose}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '500px', width: '100%' }}>
				<div className="c-hbox mb-3">
					<h3 className="flex-fill mb-0">{t('Edit API key')}</h3>
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
					<label className="c-label">{t('Name (optional)')}</label>
					<input
						className="c-input"
						placeholder={t('e.g., CI pipeline')}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				<div className="mb-3">
					<label className="c-label">{t('Expires (optional)')}</label>
					<div className="c-hbox g-2 ai-center">
						<input
							type="date"
							className="c-input flex-fill"
							value={expiresAtInput}
							min={expiresAtToDateInput(Math.floor(Date.now() / 1000))}
							onChange={(e) => setExpiresAtInput(e.target.value)}
						/>
						{expiresAtInput && (
							<Button onClick={() => setExpiresAtInput('')}>{t('Clear')}</Button>
						)}
					</div>
					<div className="c-hint small mt-1">
						{expiresAtInput
							? t('Key is valid until the end of this day.')
							: t('No expiration — the key is valid until revoked.')}
					</div>
				</div>

				<div className="mb-3">
					<label className="c-label">{t('Permissions')}</label>
					<div className="c-hint small mb-2">
						{t('Leave all unchecked for full access.')}
					</div>
					{availableScopes.map((scope) => (
						<label key={scope.value} className="c-hbox ai-start p-2">
							<input
								type="checkbox"
								className="c-toggle primary mr-2 mt-1"
								checked={selectedScopes.includes(scope.value)}
								onChange={() => toggleScope(scope.value)}
							/>
							<div>
								<span>{scope.label}</span>
								<div className="c-hint small">{scope.description}</div>
							</div>
						</label>
					))}
				</div>

				<div className="c-hbox jc-end g-2">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button variant="primary" disabled={isSubmitting} onClick={handleSave}>
						{isSubmitting ? t('Saving...') : t('Save changes')}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// One row in the DAV setup helper (CardDAV or CalDAV).
interface DavSetupRowProps {
	label: string
	idTag: string
	plaintextKey: string
	hint: string
	comingSoon?: boolean
}

function CopyButton({ text, label }: { text: string; label: string }) {
	const { t } = useTranslation()
	const [copied, setCopied] = React.useState(false)

	async function doCopy() {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	return (
		<Button onClick={doCopy} title={t('Copy {{label}}', { label })} className="small">
			{copied ? <IcCheck /> : <IcCopy />}
		</Button>
	)
}

function DavSetupRow({ label, idTag, plaintextKey, hint, comingSoon }: DavSetupRowProps) {
	const { t } = useTranslation()
	const serverUrl = `${getInstanceUrl(idTag)}/dav/principal/`

	return (
		<div className="c-panel p-3 mb-2">
			<div className="c-hbox ai-center mb-2">
				<strong className="flex-fill">{label}</strong>
				{comingSoon && (
					<span className="c-badge small" title={t('Server support not yet available')}>
						{t('Coming soon')}
					</span>
				)}
			</div>
			<div className="c-vbox g-2">
				<div>
					<label className="c-label small">{t('Server URL')}</label>
					<div className="c-hbox g-1">
						<code className="c-mono flex-fill">{serverUrl}</code>
						<CopyButton text={serverUrl} label={t('server URL')} />
					</div>
				</div>
				<div>
					<label className="c-label small">{t('Username')}</label>
					<div className="c-hbox g-1">
						<code className="c-mono flex-fill">cloudillo</code>
						<CopyButton text="cloudillo" label={t('username')} />
					</div>
					<div className="c-hint small mt-1">
						{t('Any value works — the server ignores the username.')}
					</div>
				</div>
				<div>
					<label className="c-label small">{t('Password')}</label>
					<div className="c-hbox g-1">
						<code className="c-mono flex-fill">{plaintextKey}</code>
						<CopyButton text={plaintextKey} label={t('password')} />
					</div>
				</div>
				<div className="c-hint small">{hint}</div>
			</div>
		</div>
	)
}

// API Key Created Modal (one-time plaintext key display)
interface ApiKeyCreatedModalProps {
	open: boolean
	result: CreateApiKeyResult | null
	onClose: () => void
}

function ApiKeyCreatedModal({ open, result, onClose }: ApiKeyCreatedModalProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()

	if (!result) return null

	const scopes = result.scopes?.split(',').filter(Boolean)
	const hasCardDav = scopes?.some((s) => s.startsWith('carddav:'))
	const hasCalDav = scopes?.some((s) => s.startsWith('caldav:'))
	const idTag = auth?.idTag

	return (
		<Modal open={open} onClose={onClose} closeOnBackdrop={false}>
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '600px', width: '100%' }}>
				<div className="c-hbox ai-center mb-3">
					<IcApiKey className="text-primary mr-2" style={{ fontSize: '1.5rem' }} />
					<h3 className="flex-fill mb-0">{t('API Key Created')}</h3>
				</div>

				<div className="c-panel bg-warning-subtle p-2 mb-3">
					<div className="c-hbox ai-start">
						<IcWarning className="text-warning mr-2 mt-1 flex-shrink-0" />
						<div>
							<strong>{t('Save this key now!')}</strong>
							<p className="c-hint mb-0">
								{t('This key will only be shown once. Store it securely.')}
							</p>
						</div>
					</div>
				</div>

				<div className="mb-3">
					<label className="c-label">{t('API Key')}</label>
					<div className="c-hbox g-1">
						<code className="c-mono flex-fill">{result.plaintextKey}</code>
						<CopyButton text={result.plaintextKey} label={t('API key')} />
					</div>
				</div>

				{scopes && scopes.length > 0 && (
					<div className="mb-3">
						<label className="c-label">{t('Scopes')}</label>
						<div className="c-hbox g-1 flex-wrap">
							{scopes.map((scope) => (
								<span key={scope} className="c-badge small">
									{scopeLabel(t, scope)}
								</span>
							))}
						</div>
					</div>
				)}

				{(hasCardDav || hasCalDav) && idTag && (
					<div className="mb-3">
						<label className="c-label">{t('Connect a DAV client')}</label>
						{hasCardDav && (
							<DavSetupRow
								label={t('CardDAV (contacts)')}
								idTag={idTag}
								plaintextKey={result.plaintextKey}
								hint={t(
									'Apple Contacts → Internet Accounts → Other / Thunderbird → Address Book → New CardDAV / DAVx⁵ → Add account.'
								)}
							/>
						)}
						{hasCalDav && (
							<DavSetupRow
								label={t('CalDAV (calendars)')}
								idTag={idTag}
								plaintextKey={result.plaintextKey}
								hint={t(
									'Apple Calendar → Add Account → Other / Thunderbird → New Calendar → On the Network / DAVx⁵ → Add account.'
								)}
							/>
						)}
					</div>
				)}

				<div className="c-hbox jc-end">
					<Button variant="primary" onClick={onClose}>
						{t("I've saved the key")}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

export function SecuritySettings() {
	const { t } = useTranslation()
	const [_auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const { settings } = useSettings('sec')

	// Password change state
	const [currentPassword, setCurrentPassword] = React.useState('')
	const [newPassword, setNewPassword] = React.useState('')
	const [confirmNewPassword, setConfirmNewPassword] = React.useState('')
	const [passwordError, setPasswordError] = React.useState<string | undefined>()

	// WebAuthn state
	const [passkeys, setPasskeys] = React.useState<WebAuthnCredential[]>([])
	const [passkeyDescription, setPasskeyDescription] = React.useState('')
	const [isAddingPasskey, setIsAddingPasskey] = React.useState(false)
	const [webAuthnSupported] = React.useState(() => browserSupportsWebAuthn())

	// API Key state
	const [apiKeys, setApiKeys] = React.useState<ApiKeyListItem[]>([])
	const [stayLoggedIn, setStayLoggedIn] = React.useState(false)
	const [currentDeviceKeyPrefix, setCurrentDeviceKeyPrefix] = React.useState<string | undefined>()

	// Modal state
	const [showCreateModal, setShowCreateModal] = React.useState(false)
	const [showKeyCreatedModal, setShowKeyCreatedModal] = React.useState(false)
	const [createdKeyResult, setCreatedKeyResult] = React.useState<CreateApiKeyResult | null>(null)
	const [editingKey, setEditingKey] = React.useState<ApiKeyListItem | undefined>()

	// Load passkeys and API keys on mount
	React.useEffect(
		function loadCredentials() {
			if (!api) return
			loadPasskeys()
			loadApiKeys()
			checkStayLoggedIn()
		},
		[api]
	)

	async function loadPasskeys() {
		if (!api) return
		try {
			const credentials = await api.auth.listWebAuthnCredentials()
			setPasskeys(credentials)
		} catch (err) {
			console.error('Failed to load passkeys:', err)
		}
	}

	async function loadApiKeys() {
		if (!api) return
		try {
			const keys = await api.auth.listApiKeys()
			setApiKeys(keys)
		} catch (err) {
			console.error('Failed to load API keys:', err)
		}
	}

	async function checkStayLoggedIn() {
		const storedKey = await swGetApiKey()
		setStayLoggedIn(!!storedKey)
		if (storedKey) {
			setCurrentDeviceKeyPrefix(storedKey.substring(0, 8))
		} else {
			setCurrentDeviceKeyPrefix(undefined)
		}
	}

	async function addPasskey() {
		if (!api) return
		setIsAddingPasskey(true)

		try {
			// Get registration challenge
			const challengeData = await api.auth.getWebAuthnRegChallenge()

			// Start browser registration
			// Note: options come from webauthn-rs which may have slightly different types
			const response = await startRegistration({
				optionsJSON: challengeData.options as Parameters<
					typeof startRegistration
				>[0]['optionsJSON']
			})

			// Complete registration with backend
			await api.auth.registerWebAuthnCredential({
				token: challengeData.token,
				response,
				description: passkeyDescription || undefined
			})

			setPasskeyDescription('')
			await loadPasskeys()

			await dialog.tell(
				t('Passkey added'),
				t('Your passkey has been registered successfully.')
			)
		} catch (err: unknown) {
			console.error('Failed to add passkey:', err)
			// NotAllowedError means user cancelled - don't show error
			if (err instanceof Error && err.name !== 'NotAllowedError') {
				await dialog.tell(t('Error'), err.message || t('Failed to add passkey'))
			}
		} finally {
			setIsAddingPasskey(false)
		}
	}

	async function deletePasskey(credentialId: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Delete passkey?'),
			t(
				'This passkey will be permanently removed. You may lose access to your account if this is your only authentication method.'
			)
		)

		if (!confirmed) return

		try {
			await api.auth.deleteWebAuthnCredential(credentialId)
			await loadPasskeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message || t('Failed to delete passkey'))
			}
		}
	}

	async function deleteApiKey(keyId: number, keyPrefix: string) {
		if (!api) return

		// Check if this is the current device's key
		const isCurrentDevice = currentDeviceKeyPrefix === keyPrefix

		const confirmed = await dialog.confirm(
			t('Delete API key?'),
			isCurrentDevice
				? t(
						'This is the API key for this device. Deleting it will log you out on next visit.'
					)
				: t('This API key will be permanently revoked.')
		)

		if (!confirmed) return

		try {
			await api.auth.deleteApiKey(keyId)
			if (isCurrentDevice) {
				await swDeleteApiKey()
				setStayLoggedIn(false)
				setCurrentDeviceKeyPrefix(undefined)
			}
			await loadApiKeys()
		} catch (err: unknown) {
			if (err instanceof Error) {
				await dialog.tell(t('Error'), err.message || t('Failed to delete API key'))
			}
		}
	}

	async function toggleStayLoggedIn(enabled: boolean) {
		if (!api) return

		if (enabled) {
			// Show security warning
			const confirmed = await dialog.confirm(
				t('Enable stay logged in?'),
				t(
					'This will create an API key stored on this device. Only use this on trusted devices. Anyone with access to this device will be able to access your account.'
				)
			)

			if (!confirmed) return

			try {
				// Create API key with device info as name
				const deviceName = `${(navigator as NavigatorUA).userAgentData?.platform || navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`
				const result = await api.auth.createApiKey({
					name: deviceName
				})

				// Store the plaintext key in SW encrypted storage
				await swSetApiKey(result.plaintextKey)
				setStayLoggedIn(true)
				setCurrentDeviceKeyPrefix(result.plaintextKey.substring(0, 8))
				await loadApiKeys()
			} catch (err: unknown) {
				if (err instanceof Error) {
					await dialog.tell(t('Error'), err.message || t('Failed to create API key'))
				}
			}
		} else {
			// Find and delete the API key for this device. Fetch a fresh list
			// from the server — the `apiKeys` state can be stale if another
			// session rotated keys, and a stale find() would silently leak an
			// active server-side key while we delete only the local SW copy.
			if (currentDeviceKeyPrefix) {
				try {
					const freshKeys = await api.auth.listApiKeys()
					setApiKeys(freshKeys)
					const matchingKey = freshKeys.find(
						(k) => k.keyPrefix === currentDeviceKeyPrefix
					)
					if (matchingKey) {
						await api.auth.deleteApiKey(matchingKey.keyId)
					}
				} catch (err) {
					console.error('Failed to delete API key:', err)
				}
			}

			await swDeleteApiKey()
			setStayLoggedIn(false)
			setCurrentDeviceKeyPrefix(undefined)
			await loadApiKeys()
		}
	}

	function handleApiKeyCreated(result: CreateApiKeyResult) {
		setCreatedKeyResult(result)
		setShowKeyCreatedModal(true)
		loadApiKeys()
	}

	async function onChangePassword() {
		if (!api) return
		setPasswordError(undefined)
		try {
			await api.auth.changePassword({ currentPassword, newPassword })
			setCurrentPassword('')
			setNewPassword('')
			setConfirmNewPassword('')
			await dialog.tell(
				t('Password changed'),
				t('Your password has been changed successfully.')
			)
		} catch (err) {
			setPasswordError(err instanceof Error ? err.message : t('Failed to change password'))
		}
	}

	if (!settings) return <LoadingSpinner />

	return (
		<>
			{/* Password Change Section */}
			<div className="c-panel">
				<h4 className="pb-2">{t('Change password')}</h4>
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Current password')}</span>
					<PasswordInput
						groupClassName="w-md"
						name="sec.current_password"
						autoComplete="current-password"
						value={currentPassword}
						onChange={(evt) => {
							setCurrentPassword(evt.target.value)
							setPasswordError(undefined)
						}}
					/>
				</label>
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('New password')}</span>
					<PasswordInput
						groupClassName="w-md"
						name="sec.new_password"
						autoComplete="new-password"
						value={newPassword}
						onChange={(evt) => {
							setNewPassword(evt.target.value)
							setPasswordError(undefined)
						}}
					/>
				</label>
				<PasswordStrengthBar password={newPassword} style={{ textAlign: 'right' }} />
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Confirm new password')}</span>
					<PasswordInput
						groupClassName="w-md"
						name="sec.confirm_new_password"
						autoComplete="new-password"
						value={confirmNewPassword}
						onChange={(evt) => {
							setConfirmNewPassword(evt.target.value)
							setPasswordError(undefined)
						}}
					/>
				</label>
				{confirmNewPassword && newPassword !== confirmNewPassword && (
					<div className="small text-error mt-1" style={{ textAlign: 'right' }}>
						{t('Passwords do not match')}
					</div>
				)}
				{passwordError && (
					<div className="c-panel error mt-2">
						<p>{passwordError}</p>
					</div>
				)}
				<div className="c-group">
					<Button
						variant="primary"
						disabled={
							!currentPassword ||
							!newPassword ||
							!confirmNewPassword ||
							newPassword !== confirmNewPassword ||
							newPassword.length < 8
						}
						onClick={onChangePassword}
					>
						{t('Change password')}
					</Button>
				</div>
			</div>

			{/* Passkeys Section */}
			{webAuthnSupported && (
				<div className="c-panel">
					<h4 className="c-hbox pb-2">
						<IcPasskey className="mr-2" />
						{t('Passkeys')}
					</h4>
					<p className="c-hint pb-2">
						{t('Use biometric authentication or security keys for passwordless login.')}
					</p>

					{/* List existing passkeys */}
					{passkeys.length > 0 && (
						<div className="mb-3">
							{passkeys.map((pk) => (
								<div key={pk.credentialId} className="c-hbox py-2 border-bottom">
									<IcPasskey className="mr-2" />
									<span className="flex-fill">{pk.description}</span>
									<button
										className="c-link text-error"
										onClick={() => deletePasskey(pk.credentialId)}
									>
										<IcDelete />
									</button>
								</div>
							))}
						</div>
					)}

					{/* Add new passkey */}
					<div className="c-hbox g-2">
						<input
							className="c-input w-lg"
							placeholder={t('Passkey name (optional)')}
							value={passkeyDescription}
							onChange={(e) => setPasskeyDescription(e.target.value)}
						/>
						<Button variant="primary" disabled={isAddingPasskey} onClick={addPasskey}>
							<IcAdd className="mr-1" />
							{t('Add passkey')}
						</Button>
					</div>
				</div>
			)}

			{/* Stay Logged In Section */}
			<div className="c-panel">
				<h4 className="c-hbox pb-2">
					<IcApiKey className="mr-2" />
					{t('Stay logged in')}
				</h4>
				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Keep me logged in on this device')}</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={stayLoggedIn}
						onChange={(e) => toggleStayLoggedIn(e.target.checked)}
					/>
				</label>
				<div className="c-hbox text-warning pb-2">
					<IcWarning className="mr-2 flex-shrink-0" />
					<span className="c-hint">
						{t(
							'Only enable this on personal, trusted devices. The login credentials will be stored locally.'
						)}
					</span>
				</div>
			</div>

			{/* API Keys Section */}
			<div className="c-panel">
				<div className="c-hbox pb-2">
					<h4 className="c-hbox flex-fill mb-0">
						<IcApiKey className="mr-2" />
						{t('API Keys')}
					</h4>
					<Button
						variant="primary"
						className="small"
						onClick={() => setShowCreateModal(true)}
					>
						<IcAdd className="mr-1" />
						{t('Create API key')}
					</Button>
				</div>
				<p className="c-hint pb-2">
					{t(
						'API keys allow programmatic access or keeping devices logged in. Revoking a key will revoke its access.'
					)}
				</p>

				{apiKeys.length === 0 ? (
					<p className="c-hint">{t('No API keys yet.')}</p>
				) : (
					<div>
						{apiKeys.map((key) => {
							const isCurrentDevice = currentDeviceKeyPrefix === key.keyPrefix
							const scopes = key.scopes?.split(',').filter(Boolean)
							return (
								<div key={key.keyId} className="c-hbox py-2 border-bottom">
									<IcApiKey className="mr-2" />
									<div className="flex-fill">
										<div className="c-hbox ai-center g-1 flex-wrap">
											<span>{key.name || t('Unnamed key')}</span>
											{scopes && scopes.length > 0 ? (
												scopes.map((scope) => (
													<span key={scope} className="c-badge small">
														{scopeLabel(t, scope)}
													</span>
												))
											) : (
												<span className="c-badge small success">
													{t('Full access')}
												</span>
											)}
										</div>
										<div className="c-hint small">
											{key.keyPrefix}...
											{isCurrentDevice && (
												<span className="ml-2 text-primary">
													({t('this device')})
												</span>
											)}
											{key.expiresAt &&
												(key.expiresAt * 1000 < Date.now() ? (
													<span className="ml-2 text-error">
														{t('Expired {{date}}', {
															date: new Date(
																key.expiresAt * 1000
															).toLocaleDateString()
														})}
													</span>
												) : (
													<span className="ml-2">
														{t('Expires {{date}}', {
															date: new Date(
																key.expiresAt * 1000
															).toLocaleDateString()
														})}
													</span>
												))}
										</div>
									</div>
									<button
										className="c-link"
										aria-label={t('Edit API key')}
										onClick={() => setEditingKey(key)}
									>
										<IcEdit />
									</button>
									<button
										className="c-link text-error"
										aria-label={t('Delete API key')}
										onClick={() => deleteApiKey(key.keyId, key.keyPrefix)}
									>
										<IcDelete />
									</button>
								</div>
							)
						})}
					</div>
				)}
			</div>

			{/* Modals */}
			<CreateApiKeyModal
				open={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				onCreated={handleApiKeyCreated}
			/>

			<ApiKeyCreatedModal
				open={showKeyCreatedModal}
				result={createdKeyResult}
				onClose={() => {
					setShowKeyCreatedModal(false)
					setCreatedKeyResult(null)
				}}
			/>

			<EditApiKeyModal
				open={!!editingKey}
				apiKey={editingKey}
				onClose={() => setEditingKey(undefined)}
				onSaved={() => {
					setEditingKey(undefined)
					loadApiKeys()
				}}
			/>
		</>
	)
}

// vim: ts=4
