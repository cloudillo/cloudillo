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
import {
	LuEye as IcEye,
	LuEyeOff as IcEyeOff,
	LuCircleCheck as IcSuccess,
	LuCircleAlert as IcError
} from 'react-icons/lu'

import { useApi, useAuth } from '@cloudillo/react'

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
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// Get default port based on TLS mode (static helper)
function getDefaultPortForTls(tlsMode: string): number {
	switch (tlsMode) {
		case 'tls':
			return 465
		case 'none':
		case 'starttls':
		default:
			return 587
	}
}

export function EmailSettings() {
	const { t } = useTranslation()
	const { api, authenticated } = useApi()
	const [auth] = useAuth()
	const [showPassword, setShowPassword] = React.useState(false)
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
	const [testEmailError, setTestEmailError] = React.useState<string | undefined>()

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
			if (state.smtpPort && (isNaN(port) || port < 1 || port > 65535)) {
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
			case 'none':
			case 'starttls':
			default:
				return 587
		}
	}

	// Get effective values with defaults for saving
	function getEffectivePort(): number {
		const port = parseInt(formState?.smtpPort || '', 10)
		return isNaN(port) ? getDefaultPort() : port
	}

	function getEffectiveTimeout(): number {
		const timeout = parseInt(formState?.smtpTimeoutSeconds || '', 10)
		return isNaN(timeout) ? 30 : timeout
	}

	function getEffectiveRetryAttempts(): number {
		const retries = parseInt(formState?.retryAttempts || '', 10)
		return isNaN(retries) ? 3 : retries
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
			setTestEmailError(t('Please enter a valid email address'))
			return
		}

		setTestEmailStatus('sending')
		setTestEmailError(undefined)

		try {
			await api.admin.sendTestEmail(emailToUse)
			setTestEmailStatus('success')
		} catch (err) {
			setTestEmailStatus('error')
			setTestEmailError(err instanceof Error ? err.message : t('Failed to send test email'))
		}
	}

	if (!formState) return null

	// Compute the effective from address placeholder
	const fromAddressPlaceholder = isEmail(formState.smtpUsername)
		? formState.smtpUsername
		: 'noreply@example.com'

	return (
		<>
			<div className="c-panel">
				<h4>{t('Email Configuration')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Enable email sending')}</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={formState.enabled}
						onChange={(e) => updateField('enabled', e.target.checked)}
					/>
				</label>
				<p className="c-hint mb-4">
					{t(
						'Disable for testing. When disabled, email features will be silently skipped.'
					)}
				</p>
			</div>

			{formState.enabled && (
				<>
					<div className="c-panel">
						<h4>{t('SMTP Server Configuration')}</h4>

						<label className="c-hbox pb-2">
							<span className="flex-fill">
								{t('SMTP Host')} <span className="text-danger">*</span>
							</span>
							<input
								className={`c-input w-lg ${errors.smtpHost ? 'is-invalid' : ''}`}
								type="text"
								placeholder="smtp.gmail.com"
								value={formState.smtpHost}
								onChange={(e) => updateField('smtpHost', e.target.value)}
							/>
						</label>
						{errors.smtpHost && (
							<p className="c-invalid-feedback mb-2">{errors.smtpHost}</p>
						)}
						<p className="c-hint mb-4">
							{t('SMTP server hostname. Example: smtp.gmail.com')}
						</p>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('TLS Mode')}</span>
							<select
								className="c-select w-sm"
								value={formState.smtpTlsMode}
								onChange={(e) => handleTlsModeChange(e.target.value)}
							>
								<option value="none">{t('None')}</option>
								<option value="starttls">{t('STARTTLS (recommended)')}</option>
								<option value="tls">{t('TLS/SSL')}</option>
							</select>
						</label>
						<p className="c-hint mb-4">
							{t('STARTTLS on port 587, TLS/SSL on port 465')}
						</p>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('SMTP Port')}</span>
							<input
								className={`c-input w-xs ${errors.smtpPort ? 'is-invalid' : ''}`}
								type="number"
								min="1"
								max="65535"
								placeholder={String(getDefaultPort())}
								value={formState.smtpPort}
								onChange={(e) => updateField('smtpPort', e.target.value)}
							/>
						</label>
						{errors.smtpPort && (
							<p className="c-invalid-feedback mb-2">{errors.smtpPort}</p>
						)}
						<p className="c-hint mb-4">
							{t(
								'Typically 25 (SMTP), 465 (SMTPS), or 587 (Submission with STARTTLS)'
							)}
						</p>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('Connection Timeout (seconds)')}</span>
							<input
								className="c-input w-xs"
								type="number"
								min="1"
								max="300"
								placeholder="30"
								value={formState.smtpTimeoutSeconds}
								onChange={(e) => updateField('smtpTimeoutSeconds', e.target.value)}
							/>
						</label>
						<p className="c-hint mb-4">
							{t('How long to wait before abandoning connection')}
						</p>
					</div>

					<div className="c-panel">
						<h4>{t('SMTP Authentication')}</h4>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('Username')}</span>
							<input
								className="c-input w-lg"
								type="text"
								placeholder="your@email.com"
								value={formState.smtpUsername}
								onChange={(e) => updateField('smtpUsername', e.target.value)}
							/>
						</label>
						<p className="c-hint mb-4">
							{t('SMTP authentication username (optional)')}
						</p>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('Password')}</span>
							<div className="c-input-group">
								<input
									className="c-input flex-fill"
									type={showPassword ? 'text' : 'password'}
									value={formState.smtpPassword}
									onChange={(e) => updateField('smtpPassword', e.target.value)}
									autoComplete="new-password"
									data-lpignore="true"
									data-1p-ignore="true"
								/>
								<button
									type="button"
									className="c-link px-1"
									onClick={() => setShowPassword(!showPassword)}
								>
									{showPassword ? <IcEye /> : <IcEyeOff />}
								</button>
							</div>
						</label>
						<p className="c-hint mb-4">
							{t('SMTP authentication password (optional)')}
						</p>
					</div>

					<div className="c-panel">
						<h4>{t('Sender Configuration')}</h4>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('From Address')}</span>
							<input
								className={`c-input w-lg ${errors.fromAddress ? 'is-invalid' : ''}`}
								type="email"
								placeholder={fromAddressPlaceholder}
								value={formState.fromAddress}
								onChange={(e) => updateField('fromAddress', e.target.value)}
							/>
						</label>
						{errors.fromAddress && (
							<p className="c-invalid-feedback mb-2">{errors.fromAddress}</p>
						)}
						<p className="c-hint mb-4">
							{t('Email address that will appear as the sender')}
							{isEmail(formState.smtpUsername) &&
								!formState.fromAddress &&
								` (${t('defaults to username')})`}
						</p>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('From Name')}</span>
							<input
								className="c-input w-md"
								type="text"
								placeholder="Cloudillo"
								value={formState.fromName}
								onChange={(e) => updateField('fromName', e.target.value)}
							/>
						</label>
						<p className="c-hint mb-4">{t('Display name for the sender')}</p>
					</div>

					<div className="c-panel">
						<h4>{t('Advanced Options')}</h4>

						<label className="c-hbox pb-2">
							<span className="flex-fill">{t('Retry Attempts')}</span>
							<input
								className="c-input w-xs"
								type="number"
								min="0"
								max="10"
								placeholder="3"
								value={formState.retryAttempts}
								onChange={(e) => updateField('retryAttempts', e.target.value)}
							/>
						</label>
						<p className="c-hint mb-4">
							{t('Number of times to retry sending failed emails')}
						</p>
					</div>
				</>
			)}

			<div className="c-panel">
				<div className="c-hbox">
					{isDirty && (
						<span className="text-warning me-3">{t('You have unsaved changes')}</span>
					)}
					<div className="flex-fill" />
					<button
						className="c-button primary"
						type="button"
						onClick={handleSave}
						disabled={isSaving || !isDirty}
					>
						{isSaving ? t('Saving...') : t('Save settings')}
					</button>
				</div>
			</div>

			{formState.enabled && !isDirty && (
				<div className="c-panel">
					<h4>{t('Test Email')}</h4>
					<p className="c-hint mb-3">
						{t('Send a test email to verify your SMTP configuration.')}
					</p>
					<div className="c-hbox gap-2">
						<input
							className="c-input flex-fill"
							type="email"
							placeholder={userEmail || t('recipient@example.com')}
							value={testEmailAddress}
							onChange={(e) => {
								setTestEmailAddress(e.target.value)
								setTestEmailStatus('idle')
								setTestEmailError(undefined)
							}}
						/>
						<button
							className="c-button primary"
							type="button"
							onClick={handleTestEmail}
							disabled={testEmailStatus === 'sending'}
						>
							{testEmailStatus === 'sending' ? t('Sending...') : t('Send test email')}
						</button>
					</div>
					{testEmailStatus === 'success' && (
						<div className="c-alert success mt-3">
							<div className="c-alert-icon">
								<IcSuccess />
							</div>
							<div className="c-alert-content">
								<div className="c-alert-message">
									{t('Test email sent successfully!')}
								</div>
							</div>
						</div>
					)}
					{testEmailStatus === 'error' && testEmailError && (
						<div className="c-alert error mt-3">
							<div className="c-alert-icon">
								<IcError />
							</div>
							<div className="c-alert-content">
								<div className="c-alert-title">
									{t('Failed to send test email')}
								</div>
								<div className="c-alert-message">{testEmailError}</div>
							</div>
						</div>
					)}
				</div>
			)}
		</>
	)
}

// vim: ts=4
