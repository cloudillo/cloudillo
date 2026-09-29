// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FetchError, type SmtpDiagnostic, tSmtpDiagnostic } from '@cloudillo/core'
import {
	Alert,
	Button,
	DescriptionList,
	Disclosure,
	Field,
	HBox,
	Input,
	List,
	NativeSelect,
	Panel,
	Text,
	useApi,
	useAuth,
	VBox,
	PasswordInput
} from '@cloudillo/react'
import * as T from '@symbion/runtype'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '../settings/settings.js'

interface TestEmailError {
	message: string
	diagnostic?: SmtpDiagnostic
}

// Store numeric fields as strings to allow proper editing (empty field, typing new value)
interface EmailFormState {
	enabled: boolean
	smtpHost: string
	smtpPort: string
	smtpTlsMode: string
	smtpTimeoutSeconds: string
	smtpUsername: string
	smtpPassword: string
	fromAddress: string
	fromName: string
	retryAttempts: string
}

function settingsToFormState(settings: Record<string, string | number | boolean>): EmailFormState {
	const tlsMode = (settings['email.smtp.tls_mode'] as string) || 'starttls'
	const defaultPort = getDefaultPortForTls(tlsMode)
	const savedPort = settings['email.smtp.port'] as number | undefined

	return {
		enabled: !!settings['email.enabled'],
		smtpHost: (settings['email.smtp.host'] as string) || '',
		// Store empty if saved value equals default (or not set), so placeholder shows current default
		smtpPort: savedPort != null && savedPort !== defaultPort ? String(savedPort) : '',
		smtpTlsMode: tlsMode,
		smtpTimeoutSeconds: String(settings['email.smtp.timeout_seconds'] ?? 30),
		smtpUsername: (settings['email.smtp.username'] as string) || '',
		smtpPassword: (settings['email.smtp.password'] as string) || '',
		fromAddress: (settings['email.from.address'] as string) || '',
		fromName: (settings['email.from.name'] as string) || '',
		retryAttempts: String(settings['email.retry_attempts'] ?? 3)
	}
}

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]+$/.test(value)
}

// Get default port based on TLS mode (static helper)
function getDefaultPortForTls(tlsMode: string): number {
	switch (tlsMode) {
		case 'tls':
			return 465
		default:
			return 587
	}
}

export function EmailSettings() {
	const { t } = useTranslation()
	const { api, authenticated } = useApi()
	const [auth] = useAuth()
	const [formState, setFormState] = React.useState<EmailFormState | null>(null)
	const [savedState, setSavedState] = React.useState<EmailFormState | null>(null)
	const [isSaving, setIsSaving] = React.useState(false)
	const [errors, setErrors] = React.useState<Record<string, string>>({})

	// Test email state
	const [testEmailAddress, setTestEmailAddress] = React.useState('')
	const [userEmail, setUserEmail] = React.useState<string | undefined>()
	const [testEmailStatus, setTestEmailStatus] = React.useState<
		'idle' | 'sending' | 'success' | 'error'
	>('idle')
	const [testEmailError, setTestEmailError] = React.useState<TestEmailError | undefined>()

	// Load settings and user email on mount
	React.useEffect(
		function loadSettings() {
			if (!api || !authenticated) return
			;(async function () {
				try {
					// Load email settings
					const res = await api.settings.list({ prefix: 'email' })
					const settingsMap = Object.fromEntries(
						res.map((setting) => [setting.key, setting.value])
					)
					const state = settingsToFormState(
						settingsMap as Record<string, string | number | boolean>
					)
					setFormState(state)
					setSavedState(state)

					// Load current user's email as placeholder for test email
					if (auth?.idTag) {
						const tenants = await api.admin.listTenants({ q: auth.idTag })
						const currentTenant = tenants.find((t) => t.idTag === auth.idTag)
						if (currentTenant?.email) {
							setUserEmail(currentTenant.email)
						}
					}
				} catch (err) {
					console.error('Failed to load email settings:', err)
				}
			})()
		},
		[api, authenticated, auth?.idTag]
	)

	const isDirty =
		formState && savedState && JSON.stringify(formState) !== JSON.stringify(savedState)

	function validateForm(state: EmailFormState): Record<string, string> {
		const validationErrors: Record<string, string> = {}
		if (state.enabled) {
			if (!state.smtpHost.trim()) {
				validationErrors.smtpHost = t('SMTP Host is required')
			}
			const port = parseInt(state.smtpPort, 10)
			if (state.smtpPort && (Number.isNaN(port) || port < 1 || port > 65535)) {
				validationErrors.smtpPort = t('Port must be 1-65535')
			}
			if (state.fromAddress && !isEmail(state.fromAddress)) {
				validationErrors.fromAddress = t('Invalid email format')
			}
		}
		return validationErrors
	}

	// Get default port based on TLS mode
	function getDefaultPort(): number {
		switch (formState?.smtpTlsMode) {
			case 'tls':
				return 465
			default:
				return 587
		}
	}

	// Get effective values with defaults for saving
	function getEffectivePort(): number {
		const port = parseInt(formState?.smtpPort || '', 10)
		return Number.isNaN(port) ? getDefaultPort() : port
	}

	function getEffectiveTimeout(): number {
		const timeout = parseInt(formState?.smtpTimeoutSeconds || '', 10)
		return Number.isNaN(timeout) ? 30 : timeout
	}

	function getEffectiveRetryAttempts(): number {
		const retries = parseInt(formState?.retryAttempts || '', 10)
		return Number.isNaN(retries) ? 3 : retries
	}

	async function handleSave() {
		if (!formState || !api) return

		const validationErrors = validateForm(formState)
		if (Object.keys(validationErrors).length > 0) {
			setErrors(validationErrors)
			return
		}
		setErrors({})

		setIsSaving(true)
		try {
			// Save all changed settings
			const updates: Promise<unknown>[] = []

			if (formState.enabled !== savedState?.enabled) {
				updates.push(api.settings.update('email.enabled', { value: formState.enabled }))
			}
			if (formState.smtpHost !== savedState?.smtpHost) {
				updates.push(api.settings.update('email.smtp.host', { value: formState.smtpHost }))
			}
			// Save port if it changed, or if TLS mode changed and port is empty (using default)
			const tlsModeChanged = formState.smtpTlsMode !== savedState?.smtpTlsMode
			if (
				formState.smtpPort !== savedState?.smtpPort ||
				(tlsModeChanged && !formState.smtpPort)
			) {
				updates.push(api.settings.update('email.smtp.port', { value: getEffectivePort() }))
			}
			if (tlsModeChanged) {
				updates.push(
					api.settings.update('email.smtp.tls_mode', { value: formState.smtpTlsMode })
				)
			}
			if (formState.smtpTimeoutSeconds !== savedState?.smtpTimeoutSeconds) {
				updates.push(
					api.settings.update('email.smtp.timeout_seconds', {
						value: getEffectiveTimeout()
					})
				)
			}
			if (formState.smtpUsername !== savedState?.smtpUsername) {
				updates.push(
					api.settings.update('email.smtp.username', { value: formState.smtpUsername })
				)
			}
			if (formState.smtpPassword !== savedState?.smtpPassword) {
				updates.push(
					api.settings.update('email.smtp.password', { value: formState.smtpPassword })
				)
			}
			if (formState.fromAddress !== savedState?.fromAddress) {
				updates.push(
					api.settings.update('email.from.address', { value: formState.fromAddress })
				)
			}
			if (formState.fromName !== savedState?.fromName) {
				updates.push(api.settings.update('email.from.name', { value: formState.fromName }))
			}
			if (formState.retryAttempts !== savedState?.retryAttempts) {
				updates.push(
					api.settings.update('email.retry_attempts', {
						value: getEffectiveRetryAttempts()
					})
				)
			}

			await Promise.all(updates)
			setSavedState(formState)
		} catch (err) {
			console.error('Failed to save email settings:', err)
		} finally {
			setIsSaving(false)
		}
	}

	function updateField<K extends keyof EmailFormState>(field: K, value: EmailFormState[K]) {
		setFormState((prev) => (prev ? { ...prev, [field]: value } : null))
		// Clear error for this field when user edits it
		if (errors[field]) {
			setErrors((prev) => {
				const next = { ...prev }
				delete next[field]
				return next
			})
		}
	}

	function handleTlsModeChange(newTlsMode: string) {
		const oldDefault = getDefaultPort() // based on current TLS mode
		const currentPort = parseInt(formState?.smtpPort || '', 10)

		// Update TLS mode
		updateField('smtpTlsMode', newTlsMode)

		// If port is empty or matches old default, clear it so new default shows in placeholder
		if (!formState?.smtpPort || currentPort === oldDefault) {
			updateField('smtpPort', '')
		}
	}

	async function handleTestEmail() {
		// Use entered address or fall back to user's email if available
		const emailToUse = testEmailAddress || userEmail
		if (!api || !emailToUse || !isEmail(emailToUse)) {
			setTestEmailError({ message: t('Please enter a valid email address') })
			setTestEmailStatus('error')
			return
		}

		setTestEmailStatus('sending')
		setTestEmailError(undefined)

		try {
			await api.admin.sendTestEmail(emailToUse)
			setTestEmailStatus('success')
		} catch (err) {
			setTestEmailStatus('error')
			const message = err instanceof Error ? err.message : t('Failed to send test email')
			let diagnostic: SmtpDiagnostic | undefined
			if (err instanceof FetchError && err.details !== undefined) {
				const decoded = T.decode(tSmtpDiagnostic, err.details)
				if (T.isOk(decoded)) {
					diagnostic = decoded.ok
				} else {
					console.warn('Unrecognised SMTP diagnostic shape', err.details, decoded)
				}
			}
			setTestEmailError({ message, diagnostic })
		}
	}

	function diagnosticHint(category: SmtpDiagnostic['category']): string {
		switch (category) {
			case 'auth':
				return t('Authentication failed: re-enter SMTP username and password.')
			case 'connection':
				return t('Cannot reach SMTP server: verify host, port, and firewall rules.')
			case 'tls':
				return t(
					"TLS handshake failed: check the TLS mode and port (try 'starttls' on 587 or 'tls' on 465)."
				)
			case 'transient':
				return t(
					'Transient SMTP failure: the server returned a temporary error — retrying may succeed.'
				)
			case 'permanent':
				return t(
					'Permanent SMTP failure: the server rejected the message; check from-address, sending policy, and recipient.'
				)
			default:
				// Covers the documented 'other' category and any future categories.
				return t('SMTP request failed. See raw error below for details.')
		}
	}

	if (!formState) return null

	// Compute the effective from address placeholder
	const fromAddressPlaceholder = isEmail(formState.smtpUsername)
		? formState.smtpUsername
		: 'noreply@example.com'

	return (
		<>
			<Panel title={t('Email Configuration')}>
				<List variant="divided">
					<SwitchRow
						checked={formState.enabled}
						onChange={(e) => updateField('enabled', e.target.checked)}
						label={t('Enable email sending')}
						description={t(
							'Disable for testing. When disabled, email features will be silently skipped.'
						)}
					/>
				</List>
			</Panel>

			{formState.enabled && (
				<>
					<Panel title={t('SMTP Server Configuration')}>
						<VBox gap={3}>
							<Field
								label={t('SMTP Host')}
								orientation="horizontal"
								required
								error={errors.smtpHost}
								hint={t('SMTP server hostname. Example: smtp.gmail.com')}
							>
								<Input
									type="text"
									placeholder="smtp.gmail.com"
									value={formState.smtpHost}
									onChange={(e) => updateField('smtpHost', e.target.value)}
								/>
							</Field>

							<Field
								label={t('TLS Mode')}
								orientation="horizontal"
								hint={t('STARTTLS on port 587, TLS/SSL on port 465')}
							>
								<NativeSelect
									value={formState.smtpTlsMode}
									onChange={(e) => handleTlsModeChange(e.target.value)}
								>
									<option value="none">{t('None')}</option>
									<option value="starttls">{t('STARTTLS (recommended)')}</option>
									<option value="tls">{t('TLS/SSL')}</option>
								</NativeSelect>
							</Field>

							<Field
								label={t('SMTP Port')}
								orientation="horizontal"
								error={errors.smtpPort}
								hint={t(
									'Typically 25 (SMTP), 465 (SMTPS), or 587 (Submission with STARTTLS)'
								)}
							>
								<Input
									className="w-xs"
									type="number"
									min="1"
									max="65535"
									placeholder={String(getDefaultPort())}
									value={formState.smtpPort}
									onChange={(e) => updateField('smtpPort', e.target.value)}
								/>
							</Field>

							<Field
								label={t('Connection Timeout (seconds)')}
								orientation="horizontal"
								hint={t('How long to wait before abandoning connection')}
							>
								<Input
									className="w-xs"
									type="number"
									min="1"
									max="300"
									placeholder="30"
									value={formState.smtpTimeoutSeconds}
									onChange={(e) =>
										updateField('smtpTimeoutSeconds', e.target.value)
									}
								/>
							</Field>
						</VBox>
					</Panel>

					<Panel title={t('SMTP Authentication')}>
						<VBox gap={3}>
							<Field
								label={t('Username')}
								orientation="horizontal"
								hint={t('SMTP authentication username (optional)')}
							>
								<Input
									type="text"
									placeholder="your@email.com"
									value={formState.smtpUsername}
									onChange={(e) => updateField('smtpUsername', e.target.value)}
								/>
							</Field>

							<Field
								label={t('Password')}
								orientation="horizontal"
								id="email-smtp-password"
								hint={t('SMTP authentication password (optional)')}
							>
								<PasswordInput
									id="email-smtp-password"
									value={formState.smtpPassword}
									onChange={(e) => updateField('smtpPassword', e.target.value)}
									autoComplete="new-password"
									data-lpignore="true"
									data-1p-ignore="true"
								/>
							</Field>
						</VBox>
					</Panel>

					<Panel title={t('Sender Configuration')}>
						<VBox gap={3}>
							<Field
								label={t('From Address')}
								orientation="horizontal"
								error={errors.fromAddress}
								hint={
									t('Email address that will appear as the sender') +
									(isEmail(formState.smtpUsername) && !formState.fromAddress
										? ` (${t('defaults to username')})`
										: '')
								}
							>
								<Input
									type="email"
									placeholder={fromAddressPlaceholder}
									value={formState.fromAddress}
									onChange={(e) => updateField('fromAddress', e.target.value)}
								/>
							</Field>

							<Field
								label={t('From Name')}
								orientation="horizontal"
								hint={t('Display name for the sender')}
							>
								<Input
									type="text"
									placeholder="Cloudillo"
									value={formState.fromName}
									onChange={(e) => updateField('fromName', e.target.value)}
								/>
							</Field>
						</VBox>
					</Panel>

					<Panel title={t('Advanced Options')}>
						<Field
							label={t('Retry Attempts')}
							orientation="horizontal"
							hint={t('Number of times to retry sending failed emails')}
						>
							<Input
								className="w-xs"
								type="number"
								min="0"
								max="10"
								placeholder="3"
								value={formState.retryAttempts}
								onChange={(e) => updateField('retryAttempts', e.target.value)}
							/>
						</Field>
					</Panel>
				</>
			)}

			<Panel>
				<HBox gap={3} align="center" justify="end">
					{isDirty && (
						<Text color="warning" className="flex-fill">
							{t('You have unsaved changes')}
						</Text>
					)}
					<Button
						color="primary"
						onClick={handleSave}
						loading={isSaving}
						disabled={isSaving || !isDirty}
					>
						{isSaving ? t('Saving...') : t('Save settings')}
					</Button>
				</HBox>
			</Panel>

			{formState.enabled && !isDirty && (
				<Panel
					title={t('Test Email')}
					description={t('Send a test email to verify your SMTP configuration.')}
				>
					<HBox gap={2}>
						<Input
							className="flex-fill"
							type="email"
							aria-label={t('Test email recipient')}
							placeholder={userEmail || t('recipient@example.com')}
							value={testEmailAddress}
							onChange={(e) => {
								setTestEmailAddress(e.target.value)
								setTestEmailStatus('idle')
								setTestEmailError(undefined)
							}}
						/>
						<Button
							color="primary"
							onClick={handleTestEmail}
							loading={testEmailStatus === 'sending'}
							disabled={testEmailStatus === 'sending'}
						>
							{testEmailStatus === 'sending' ? t('Sending...') : t('Send test email')}
						</Button>
					</HBox>
					{testEmailStatus === 'success' && (
						<Alert color="success" className="mt-3">
							{t('Test email sent successfully!')}
						</Alert>
					)}
					{testEmailStatus === 'error' && testEmailError && (
						<Alert
							color="error"
							className="mt-3"
							title={t('Failed to send test email')}
						>
							{testEmailError.message}
							{testEmailError.diagnostic && (
								<VBox gap={2} className="mt-2">
									<Text as="p">
										{diagnosticHint(testEmailError.diagnostic.category)}
									</Text>
									{(testEmailError.diagnostic.smtpCode !== undefined ||
										testEmailError.diagnostic.smtpResponse) && (
										<DescriptionList
											items={[
												...(testEmailError.diagnostic.smtpCode !== undefined
													? [
															{
																key: 'code',
																term: t('SMTP code'),
																description:
																	testEmailError.diagnostic
																		.smtpCode
															}
														]
													: []),
												...(testEmailError.diagnostic.smtpResponse
													? [
															{
																key: 'response',
																term: t('Server response'),
																description:
																	testEmailError.diagnostic
																		.smtpResponse
															}
														]
													: [])
											]}
										/>
									)}
									<Disclosure variant="ghost" summary={t('Raw error')}>
										<Text as="div" mono preWrap>
											{testEmailError.diagnostic.raw}
										</Text>
									</Disclosure>
								</VBox>
							)}
						</Alert>
					)}
				</Panel>
			)}
		</>
	)
}

// vim: ts=4
