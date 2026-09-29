// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	type ApiKeyListItem,
	type CreateApiKeyResult,
	getInstanceUrl,
	type WebAuthnCredential
} from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Badge,
	Button,
	Checkbox,
	CodeBlock,
	Dialog,
	Field,
	HBox,
	Input,
	InputGroup,
	List,
	ListItem,
	LoadingSpinner,
	Panel,
	Text,
	useApi,
	useAuth,
	useDialog,
	VBox,
	PasswordInput,
	PasswordStrengthBar
} from '@cloudillo/react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import type { TFunction } from 'i18next'
import * as React from 'react'

interface NavigatorUA {
	userAgentData?: { platform: string }
}

import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuKey as IcApiKey,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuFingerprint as IcPasskey
} from 'react-icons/lu'

import {
	deleteApiKey as swDeleteApiKey,
	getApiKey as swGetApiKey,
	setApiKey as swSetApiKey
} from '../pwa.js'
import { registerPasskey } from './passkey.js'
import { SwitchRow, useSettings } from './settings.js'

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

// Scope checkboxes shared by the create and edit dialogs (submitted with the form → Checkbox)
interface ScopeChecklistProps {
	scopes: ScopeDef[]
	selected: string[]
	onToggle: (scope: string) => void
}

function ScopeChecklist({ scopes, selected, onToggle }: ScopeChecklistProps) {
	const { t } = useTranslation()

	return (
		<VBox gap={2} role="group" aria-label={t('Permissions')}>
			<Text emphasis="strong">{t('Permissions')}</Text>
			<Text size="sm" emphasis="muted">
				{t('Leave all unchecked for full access.')}
			</Text>
			{scopes.map((scope) => (
				<Checkbox
					key={scope.value}
					checked={selected.includes(scope.value)}
					onChange={() => onToggle(scope.value)}
					label={scope.label}
					description={scope.description}
				/>
			))}
		</VBox>
	)
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
		<Dialog
			open={open}
			onClose={onClose}
			title={t('Create API Key')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button color="primary" loading={isSubmitting} onClick={handleCreate}>
						{t('Create API Key')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && <Alert color="error">{error}</Alert>}

				<Field label={t('Name (optional)')}>
					<Input
						placeholder={t('e.g., CI pipeline')}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</Field>

				<ScopeChecklist
					scopes={availableScopes}
					selected={selectedScopes}
					onToggle={toggleScope}
				/>
			</VBox>
		</Dialog>
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
		<Dialog
			open={open}
			onClose={onClose}
			title={t('Edit API key')}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button color="primary" loading={isSubmitting} onClick={handleSave}>
						{t('Save changes')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && <Alert color="error">{error}</Alert>}

				<Field label={t('Name (optional)')}>
					<Input
						placeholder={t('e.g., CI pipeline')}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</Field>

				<Field
					label={t('Expires (optional)')}
					hint={
						expiresAtInput
							? t('Key is valid until the end of this day.')
							: t('No expiration — the key is valid until revoked.')
					}
				>
					<HBox gap={2} align="center">
						<Input
							type="date"
							className="flex-fill"
							value={expiresAtInput}
							min={expiresAtToDateInput(Math.floor(Date.now() / 1000))}
							onChange={(e) => setExpiresAtInput(e.target.value)}
						/>
						{expiresAtInput && (
							<Button onClick={() => setExpiresAtInput('')}>{t('Clear')}</Button>
						)}
					</HBox>
				</Field>

				<ScopeChecklist
					scopes={availableScopes}
					selected={selectedScopes}
					onToggle={toggleScope}
				/>
			</VBox>
		</Dialog>
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

function DavSetupRow({ label, idTag, plaintextKey, hint, comingSoon }: DavSetupRowProps) {
	const { t } = useTranslation()
	const serverUrl = `${getInstanceUrl(idTag)}/dav/principal/`

	return (
		<Panel padding={3}>
			<VBox gap={2}>
				<HBox align="center">
					<Text emphasis="strong" className="flex-fill">
						{label}
					</Text>
					{comingSoon && (
						<Badge size="sm" title={t('Server support not yet available')}>
							{t('Coming soon')}
						</Badge>
					)}
				</HBox>
				<VBox gap={1}>
					<Text size="sm">{t('Server URL')}</Text>
					<CodeBlock copyable>{serverUrl}</CodeBlock>
				</VBox>
				<VBox gap={1}>
					<Text size="sm">{t('Username')}</Text>
					<CodeBlock copyable>cloudillo</CodeBlock>
					<Text size="sm" emphasis="muted">
						{t('Any value works — the server ignores the username.')}
					</Text>
				</VBox>
				<VBox gap={1}>
					<Text size="sm">{t('Password')}</Text>
					<CodeBlock copyable>{plaintextKey}</CodeBlock>
				</VBox>
				<Text size="sm" emphasis="muted">
					{hint}
				</Text>
			</VBox>
		</Panel>
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
		<Dialog
			open={open}
			onClose={onClose}
			dismissable={false}
			size="md"
			icon={<IcApiKey />}
			title={t('API Key Created')}
			footer={
				<ActionBar>
					<Button color="primary" onClick={onClose}>
						{t("I've saved the key")}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				<Alert color="warning" title={t('Save this key now!')}>
					{t('This key will only be shown once. Store it securely.')}
				</Alert>

				<VBox gap={1}>
					<Text emphasis="strong">{t('API Key')}</Text>
					<CodeBlock copyable>{result.plaintextKey}</CodeBlock>
				</VBox>

				{scopes && scopes.length > 0 && (
					<VBox gap={1}>
						<Text emphasis="strong">{t('Scopes')}</Text>
						<HBox gap={1} wrap>
							{scopes.map((scope) => (
								<Badge key={scope} size="sm">
									{scopeLabel(t, scope)}
								</Badge>
							))}
						</HBox>
					</VBox>
				)}

				{(hasCardDav || hasCalDav) && idTag && (
					<VBox gap={2}>
						<Text emphasis="strong">{t('Connect a DAV client')}</Text>
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
					</VBox>
				)}
			</VBox>
		</Dialog>
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
			await registerPasskey(api, passkeyDescription || undefined)

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
			),
			{ color: 'error', confirmLabel: t('Delete') }
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
				: t('This API key will be permanently revoked.'),
			{ color: 'error', confirmLabel: t('Delete') }
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
				),
				{ confirmLabel: t('Enable') }
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
					// Dropping only the local copy would leave an active server-side
					// key nobody can see or revoke from this device. Keep both and
					// let the user retry.
					console.error('Failed to delete API key:', err)
					await dialog.tell(
						t('Error'),
						err instanceof Error && err.message
							? err.message
							: t('Failed to remove the API key from the server. Please try again.')
					)
					return
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

	if (!settings) return <LoadingSpinner className="auto-bg" />

	return (
		<>
			<Panel title={t('Change password')}>
				<VBox gap={2}>
					<Field
						label={t('Current password')}
						orientation="horizontal"
						id="sec-current-password"
					>
						<PasswordInput
							id="sec-current-password"
							name="sec.current_password"
							autoComplete="current-password"
							value={currentPassword}
							onChange={(evt) => {
								setCurrentPassword(evt.target.value)
								setPasswordError(undefined)
							}}
						/>
					</Field>
					<Field label={t('New password')} orientation="horizontal" id="sec-new-password">
						<PasswordInput
							id="sec-new-password"
							name="sec.new_password"
							autoComplete="new-password"
							value={newPassword}
							onChange={(evt) => {
								setNewPassword(evt.target.value)
								setPasswordError(undefined)
							}}
						/>
					</Field>
					<PasswordStrengthBar password={newPassword} align="right" />
					<Field
						label={t('Confirm new password')}
						orientation="horizontal"
						id="sec-confirm-new-password"
						error={
							confirmNewPassword && newPassword !== confirmNewPassword
								? t('Passwords do not match')
								: undefined
						}
					>
						<PasswordInput
							id="sec-confirm-new-password"
							name="sec.confirm_new_password"
							autoComplete="new-password"
							value={confirmNewPassword}
							onChange={(evt) => {
								setConfirmNewPassword(evt.target.value)
								setPasswordError(undefined)
							}}
						/>
					</Field>
					{passwordError && <Alert color="error">{passwordError}</Alert>}
					<ActionBar>
						<Button
							color="primary"
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
					</ActionBar>
				</VBox>
			</Panel>

			{webAuthnSupported && (
				<Panel
					title={t('Passkeys')}
					description={t(
						'Use biometric authentication or security keys for passwordless login.'
					)}
				>
					{passkeys.length > 0 && (
						<List variant="divided">
							{passkeys.map((pk) => (
								<ListItem
									key={pk.credentialId}
									leading={<IcPasskey />}
									title={pk.description}
									trailing={
										<Button
											variant="ghost"
											color="error"
											icon={<IcDelete />}
											aria-label={t('Delete passkey')}
											onClick={() => deletePasskey(pk.credentialId)}
										/>
									}
								/>
							))}
						</List>
					)}

					<InputGroup className="mt-3">
						<Input
							aria-label={t('Passkey name (optional)')}
							placeholder={t('Passkey name (optional)')}
							value={passkeyDescription}
							onChange={(e) => setPasskeyDescription(e.target.value)}
						/>
						<Button
							color="primary"
							icon={<IcAdd />}
							loading={isAddingPasskey}
							onClick={addPasskey}
						>
							{t('Add passkey')}
						</Button>
					</InputGroup>
				</Panel>
			)}

			<Panel title={t('Stay logged in')}>
				<List variant="divided">
					<SwitchRow
						checked={stayLoggedIn}
						onChange={(e) => toggleStayLoggedIn(e.target.checked)}
						label={t('Keep me logged in on this device')}
					/>
				</List>
				<Alert color="warning" compact>
					{t(
						'Only enable this on personal, trusted devices. The login credentials will be stored locally.'
					)}
				</Alert>
			</Panel>

			<Panel
				title={t('API Keys')}
				description={t(
					'API keys allow programmatic access or keeping devices logged in. Revoking a key will revoke its access.'
				)}
				actions={
					<Button
						color="primary"
						size="sm"
						icon={<IcAdd />}
						onClick={() => setShowCreateModal(true)}
					>
						{t('Create API key')}
					</Button>
				}
			>
				{apiKeys.length === 0 ? (
					<Text emphasis="muted">{t('No API keys yet.')}</Text>
				) : (
					<List variant="divided">
						{apiKeys.map((key) => {
							const isCurrentDevice = currentDeviceKeyPrefix === key.keyPrefix
							const scopes = key.scopes?.split(',').filter(Boolean)
							return (
								<ListItem
									key={key.keyId}
									leading={<IcApiKey />}
									title={
										<>
											{key.name || t('Unnamed key')}{' '}
											{scopes && scopes.length > 0 ? (
												scopes.map((scope) => (
													<Badge key={scope} size="sm" className="ms-1">
														{scopeLabel(t, scope)}
													</Badge>
												))
											) : (
												<Badge size="sm" color="success" className="ms-1">
													{t('Full access')}
												</Badge>
											)}
										</>
									}
									subtitle={
										<>
											{key.keyPrefix}...
											{isCurrentDevice && (
												<Text color="primary" className="ms-2">
													({t('this device')})
												</Text>
											)}
											{key.expiresAt &&
												(key.expiresAt * 1000 < Date.now() ? (
													<Text color="error" className="ms-2">
														{t('Expired {{date}}', {
															date: new Date(
																key.expiresAt * 1000
															).toLocaleDateString()
														})}
													</Text>
												) : (
													<Text className="ms-2">
														{t('Expires {{date}}', {
															date: new Date(
																key.expiresAt * 1000
															).toLocaleDateString()
														})}
													</Text>
												))}
										</>
									}
									trailing={
										<HBox gap={1}>
											<Button
												variant="ghost"
												icon={<IcEdit />}
												aria-label={t('Edit API key')}
												onClick={() => setEditingKey(key)}
											/>
											<Button
												variant="ghost"
												color="error"
												icon={<IcDelete />}
												aria-label={t('Delete API key')}
												onClick={() =>
													deleteApiKey(key.keyId, key.keyPrefix)
												}
											/>
										</HBox>
									}
								/>
							)
						})}
					</List>
				)}
			</Panel>

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
