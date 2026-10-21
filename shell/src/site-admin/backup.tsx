// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type BackupStatus, FetchError } from '@cloudillo/core'
import {
	Alert,
	Badge,
	Button,
	EmptyState,
	Field,
	HBox,
	Input,
	Panel,
	Table,
	TableCell,
	TableRow,
	Text,
	useApi,
	useDialog,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcDatabase } from '../icons.js'
import { SettingsDenied, useSettings } from '../settings/settings.js'
import { formatBytes, formatUnixTime } from '../utils.js'

export function Backup() {
	const { t } = useTranslation()
	const { api } = useApi()
	const dialog = useDialog()
	const { settings, onSettingChange, denied } = useSettings(['backup'], { level: 'global' })
	const [status, setStatus] = React.useState<BackupStatus | undefined>()
	const [error, setError] = React.useState<string | undefined>()

	const load = React.useCallback(async () => {
		if (!api) return
		try {
			setStatus(await api.admin.backupStatus())
			setError(undefined)
		} catch (err) {
			console.error('Failed to load backup status:', err)
			setError(err instanceof Error ? err.message : String(err))
		}
	}, [api])

	React.useEffect(() => {
		load()
	}, [load])

	// Polls every 5 s while a run is in progress; no push event exists for it
	React.useEffect(() => {
		if (!status?.running) return
		const timer = setInterval(load, 5000)
		return () => clearInterval(timer)
	}, [status?.running, load])

	async function runBackup() {
		if (!api) return
		try {
			await api.admin.runBackup()
			// The run may not have flagged itself yet; mark it so the poll starts
			setStatus((s) => s && { ...s, running: true })
		} catch (err) {
			if (err instanceof FetchError && err.httpStatus === 409) {
				await dialog.tell(t('Backup'), t('A backup is already running.'))
			} else {
				await dialog.tell(t('Error'), err instanceof Error ? err.message : String(err))
			}
			load()
		}
	}

	if (denied) return <SettingsDenied />

	const last = status?.last

	return (
		<VBox gap={3}>
			{error && <Alert color="error">{error}</Alert>}

			<Panel title={t('Backup')}>
				<VBox gap={2}>
					<HBox gap={2} align="center" wrap>
						<Text className="flex-fill">
							{last
								? t('Last run: {{time}}, {{size}}', {
										time: formatUnixTime(last.at, 'YYYY-MM-DD HH:mm'),
										size: formatBytes(last.bytes)
									})
								: t('No backup has run since the server started.')}
						</Text>
						{status?.running ? (
							<Badge color="info">{t('Running')}</Badge>
						) : (
							last && (
								<Badge color={last.ok ? 'success' : 'error'}>
									{last.ok ? t('Succeeded') : t('Failed')}
								</Badge>
							)
						)}
						<Button
							color="primary"
							icon={<IcDatabase />}
							disabled={!status || status.running}
							onClick={runBackup}
						>
							{t('Run backup now')}
						</Button>
					</HBox>
					{last?.error && <Alert color="error">{last.error}</Alert>}
					<Text size="sm" emphasis="muted">
						{t('Restoring a snapshot is done offline, with the server stopped.')}
					</Text>
				</VBox>
			</Panel>

			{settings && (
				<Panel title={t('Schedule')}>
					<Field
						label={t('Daily backup time (UTC)')}
						orientation="horizontal"
						hint={t(
							'Empty turns the scheduled backup off. A change takes effect after a server restart.'
						)}
					>
						<Input
							type="time"
							name="backup.time"
							value={(settings['backup.time'] as string | undefined) ?? ''}
							onChange={onSettingChange}
						/>
					</Field>
					<Field label={t('Snapshots to keep')} orientation="horizontal">
						<Input
							type="number"
							min={1}
							name="backup.keep"
							value={(settings['backup.keep'] as number | undefined) ?? 7}
							onChange={onSettingChange}
						/>
					</Field>
				</Panel>
			)}

			<Panel title={t('Snapshots')}>
				{status && !status.snapshots.length ? (
					<EmptyState title={t('No snapshots yet')} />
				) : (
					<Table
						stack
						aria-label={t('Snapshots')}
						columns={[t('Name'), t('Created'), t('Size')]}
					>
						{status?.snapshots.map((snap) => (
							<TableRow key={snap.name}>
								<TableCell>
									<Text mono>{snap.name}</Text>
								</TableCell>
								<TableCell>
									{formatUnixTime(snap.createdAt, 'YYYY-MM-DD HH:mm')}
								</TableCell>
								<TableCell>{formatBytes(snap.bytes)}</TableCell>
							</TableRow>
						))}
					</Table>
				)}
			</Panel>
		</VBox>
	)
}

// vim: ts=4
