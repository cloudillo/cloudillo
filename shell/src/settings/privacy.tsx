// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { downloadBlob, errorMessage, type ExportStatus, FetchError } from '@cloudillo/core'
import {
	Button,
	Field,
	IcDownload,
	List,
	LoadingSpinner,
	NativeSelect,
	Panel,
	Text,
	useApi,
	useToast,
	type VisibilityCode,
	VisibilitySelect
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { formatBytes } from '../utils.js'
import { SwitchRow, useSettings } from './settings.js'

const EXPORT_POLL_MS = 5000

/** "Download my data": request → poll while pending → download the ZIP. Tenant-only on the server. */
export function DataExportPanel() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	// undefined = loading, null = no export yet
	const [status, setStatus] = React.useState<ExportStatus | null>()
	const [hidden, setHidden] = React.useState(false)
	const [busy, setBusy] = React.useState(false)
	// Toast a persistent error once, not on every poll
	const failedRef = React.useRef(false)

	const loadStatus = React.useCallback(
		async function loadStatus() {
			if (!api) return
			try {
				setStatus(await api.auth.getExport())
				failedRef.current = false
			} catch (err) {
				if (err instanceof FetchError && err.httpStatus === 404) setStatus(null)
				else if (err instanceof FetchError && err.httpStatus === 403) setHidden(true)
				else {
					if (!failedRef.current) toastError(errorMessage(err))
					failedRef.current = true
				}
			}
		},
		[api, toastError]
	)

	React.useEffect(() => {
		void loadStatus()
	}, [loadStatus])

	const pending = status?.status === 'pending'
	React.useEffect(() => {
		if (!pending) return
		const timer = setInterval(() => void loadStatus(), EXPORT_POLL_MS)
		return () => clearInterval(timer)
	}, [pending, loadStatus])

	async function requestExport() {
		if (!api) return
		setBusy(true)
		try {
			setStatus(await api.auth.requestExport())
		} catch (err) {
			// Already pending: show it and start polling
			if (err instanceof FetchError && err.httpStatus === 409) await loadStatus()
			else toastError(errorMessage(err))
		} finally {
			setBusy(false)
		}
	}

	async function download() {
		if (!api) return
		setBusy(true)
		try {
			downloadBlob(await api.auth.downloadExport(), 'cloudillo-export.zip')
		} catch (err) {
			toastError(errorMessage(err))
		} finally {
			setBusy(false)
			// The backend deletes the export on first download
			await loadStatus()
		}
	}

	if (hidden || status === undefined) return null
	return (
		<Panel
			title={t('Download my data')}
			description={t(
				'Get a ZIP archive of your files, documents, posts and profile. The archive is kept for 24 hours.'
			)}
			actions={
				status?.status === 'ready' ? (
					<Button
						color="primary"
						size="sm"
						icon={<IcDownload />}
						disabled={busy}
						onClick={download}
					>
						{t('Download')}
					</Button>
				) : (
					<Button size="sm" disabled={busy || pending} onClick={requestExport}>
						{t('Request export')}
					</Button>
				)
			}
		>
			{pending && (
				<Text emphasis="muted">
					<LoadingSpinner size="sm" /> {t('Preparing your archive...')}
				</Text>
			)}
			{status?.status === 'ready' && (
				<Text>
					{t('Your archive is ready ({{size}}).', {
						size: status.size === undefined ? '?' : formatBytes(status.size)
					})}
				</Text>
			)}
			{status?.status === 'failed' && (
				<Text color="error">{t('The export failed. Please try again.')}</Text>
			)}
		</Panel>
	)
}

export function PrivacySettings() {
	const { t } = useTranslation()
	useApi()
	const { settings, onSettingChange } = useSettings('profile')

	if (!settings) return <LoadingSpinner className="auto-bg" />

	// VisibilitySelect reports a value, onSettingChange reads a select-shaped event target
	function onVisibilityChange(value: VisibilityCode) {
		void onSettingChange({
			target: {
				name: 'profile.default_visibility',
				value,
				type: 'select-one',
				tagName: 'SELECT'
			}
		} as unknown as React.ChangeEvent<HTMLSelectElement>)
	}

	return (
		<>
			<Panel title={t('Post visibility')}>
				<Field
					label={t('Default visibility for new posts')}
					orientation="horizontal"
					hint={t('You can change visibility for individual posts when creating them.')}
				>
					<VisibilitySelect
						value={
							((settings['profile.default_visibility'] as string) ||
								'F') as VisibilityCode
						}
						onChange={onVisibilityChange}
					/>
				</Field>
			</Panel>

			<Panel title={t('Connections')}>
				<Field
					label={t('Connection mode')}
					orientation="horizontal"
					hint={
						<>
							{t('Controls how connection requests to your profile are handled.')}{' '}
							{settings['profile.connection_mode'] === 'A'
								? t('Anyone can connect with you immediately.')
								: settings['profile.connection_mode'] === 'I'
									? t('Connection requests are automatically rejected.')
									: t('You will be asked to approve each connection request.')}
						</>
					}
				>
					<NativeSelect
						name="profile.connection_mode"
						value={(settings['profile.connection_mode'] as string) ?? 'M'}
						onChange={onSettingChange}
					>
						<option value="M">{t('Manual approval')}</option>
						<option value="A">{t('Auto-accept')}</option>
						<option value="I">{t('Ignore (reject all)')}</option>
					</NativeSelect>
				</Field>
				<List variant="divided">
					<SwitchRow
						name="profile.allow_followers"
						checked={settings['profile.allow_followers'] !== false}
						onChange={onSettingChange}
						label={t('Allow others to follow you')}
						description={t(
							'When disabled, new follow requests will be rejected and your posts will only be visible to your connections.'
						)}
					/>
					<SwitchRow
						name="profile.auto_approve_actions"
						checked={!!settings['profile.auto_approve_actions']}
						onChange={onSettingChange}
						label={t('Auto-approve incoming actions')}
						description={t(
							'When enabled, posts and messages from trusted sources are automatically approved without manual review.'
						)}
					/>
				</List>
			</Panel>

			<DataExportPanel />
		</>
	)
}

// vim: ts=4
