// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** "This device": the Android app's backup settings, over the native bridge. */

import {
	Alert,
	Button,
	Disclosure,
	Field,
	List,
	ListItem,
	LoadError,
	LoadingSpinner,
	NativeSelect,
	Panel,
	Progress,
	Text,
	useAuth,
	useDialog,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { isQrNativeOff, setQrNativeOff } from '../components/QrScanner/state.js'
import {
	type BackupFailure,
	type BackupGlobals,
	type BackupSource,
	type BackupState,
	backupApi,
	DeviceAccountMismatchError,
	relinkDevice,
	useBackupState
} from '../native-bridge.js'
import { profileLabel, UPLOAD_PROFILES, type UploadProfile } from '../upload-profiles.js'
import { formatBytes } from '../utils.js'
import { SwitchRow } from './settings.js'

type T = (key: string, opts?: Record<string, unknown>) => string

function presetDescription(t: T, preset: UploadProfile): string {
	switch (preset) {
		case 'standard':
			return t('Original kept; balanced viewing copies')
		case 'high':
			return t('Original kept; maximum-quality copies')
		case 'compact':
			return t('No original kept; space-saving copies')
		case 'preview':
			return t('Original kept; thumbnail only')
		case 'orig':
			return t('Original kept as-is; no processing')
	}
}

function networkLabel(t: T, mobileData: boolean): string {
	return mobileData ? t('Wi-Fi and mobile data') : t('Wi-Fi only')
}

function Failures({ id }: { id: string }) {
	const { t } = useTranslation()
	const [failures, setFailures] = React.useState<BackupFailure[]>()
	const [error, setError] = React.useState<Error>()

	function load(open: boolean) {
		if (!open) return
		backupApi.failures(id).then(setFailures, (err: Error) => setError(err))
	}

	return (
		<Disclosure summary={t('Show failures')} onToggle={load}>
			{error ? (
				<Text emphasis="muted">{error.message}</Text>
			) : !failures ? (
				<LoadingSpinner />
			) : (
				<List variant="divided">
					{failures.map((f) => (
						<ListItem
							key={f.name}
							title={f.name}
							subtitle={`${f.lastError ?? t('Unknown error')} · ${t('{{n}} attempts', { n: f.attempts })}`}
						/>
					))}
				</List>
			)}
		</Disclosure>
	)
}

interface SourceProps {
	source: BackupSource
	globals: BackupGlobals
	run: (action: () => Promise<BackupState | undefined>) => Promise<void>
}

function SourceItem({ source, globals, run }: SourceProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const { total, done, failed } = source.counts
	const effectivePreset = source.preset ?? globals.defaultPreset
	// Blocks a second toggle while the estimate/dialog/enable chain runs
	const [busy, setBusy] = React.useState(false)

	function onEnabledChange(evt: React.ChangeEvent<HTMLInputElement>) {
		setBusy(true)
		if (!evt.target.checked) {
			run(() => backupApi.disableSource(source.id)).finally(() => setBusy(false))
			return
		}
		run(async function enable() {
			const est = await backupApi.estimate(source.id)
			const includeExisting = await dialog.ask(
				t('Back up {{name}}', { name: source.name }),
				t('Should the items already on this device be backed up too?'),
				{
					confirmLabel: t('Back up existing items ({{n}} items, {{size}})', {
						n: est.count,
						size: formatBytes(est.bytes)
					}),
					cancelLabel: t('Only new items from now on')
				}
			)
			// Dismissed: leave the source off
			if (includeExisting === undefined) return undefined
			return backupApi.enableSource(source.id, includeExisting)
		}).finally(() => setBusy(false))
	}

	function onPresetChange(evt: React.ChangeEvent<HTMLSelectElement>) {
		const preset = (evt.target.value || null) as UploadProfile | null
		run(() => backupApi.setSource({ id: source.id, preset }))
	}

	function onMobileDataChange(evt: React.ChangeEvent<HTMLSelectElement>) {
		const v = evt.target.value
		run(() =>
			backupApi.setSource({ id: source.id, mobileData: v === '' ? null : v === 'mobile' })
		)
	}

	const countsText = t('{{done}} of {{total}} backed up', { done, total })

	return (
		<ListItem>
			<List>
				<SwitchRow
					checked={source.enabled}
					disabled={busy}
					onChange={onEnabledChange}
					label={source.name}
					description={
						failed ? `${countsText} · ${t('{{n}} failed', { n: failed })}` : countsText
					}
				/>
			</List>
			{(source.enabled || source.kind === 'saf') && (
				<Disclosure
					summary={`${t('Options')} · ${profileLabel(t, effectivePreset)} · ${networkLabel(t, source.mobileData ?? globals.defaultMobileData)}`}
				>
					<Field
						label={t('Upload quality')}
						orientation="horizontal"
						hint={presetDescription(t, effectivePreset)}
					>
						<NativeSelect value={source.preset ?? ''} onChange={onPresetChange}>
							<option value="">
								{t('Default ({{value}})', {
									value: profileLabel(t, globals.defaultPreset)
								})}
							</option>
							{UPLOAD_PROFILES.map((p) => (
								<option key={p} value={p}>
									{profileLabel(t, p)}
								</option>
							))}
						</NativeSelect>
					</Field>
					<Field label={t('Network')} orientation="horizontal">
						<NativeSelect
							value={
								source.mobileData === null
									? ''
									: source.mobileData
										? 'mobile'
										: 'wifi'
							}
							onChange={onMobileDataChange}
						>
							<option value="">
								{t('Default ({{value}})', {
									value: networkLabel(t, globals.defaultMobileData)
								})}
							</option>
							<option value="wifi">{networkLabel(t, false)}</option>
							<option value="mobile">{networkLabel(t, true)}</option>
						</NativeSelect>
					</Field>
					{failed > 0 && <Failures id={source.id} />}
					{source.kind === 'saf' && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() => run(() => backupApi.removeFolder(source.id))}
						>
							{t('Remove folder')}
						</Button>
					)}
				</Disclosure>
			)}
		</ListItem>
	)
}

export function DeviceSettings() {
	const { t } = useTranslation()
	const toast = useToast()
	const { state, setState, error, refresh } = useBackupState()
	const [auth] = useAuth()
	const idTag = auth?.idTag
	const [qrNative, setQrNative] = React.useState(() => !isQrNativeOff())

	/** Runs a bridge call; a returned full state replaces ours, anything else waits for `backup.changed`. */
	function run(action: () => Promise<BackupState | undefined>): Promise<void> {
		return action().then(
			(s) => {
				if (s) setState(s)
			},
			(err: unknown) => {
				toast.error(err instanceof Error ? err.message : String(err))
			}
		)
	}

	if (error)
		return (
			<LoadError error={error} onRetry={refresh} title={t("Couldn't load these settings")} />
		)
	if (!state) return <LoadingSpinner className="auto-bg" />

	const { permissions, globals, progress } = state
	const media = state.sources.filter((s) => s.kind === 'media')
	const folders = state.sources.filter((s) => s.kind === 'saf')

	function setGlobals(patch: Partial<BackupGlobals>) {
		run(() => backupApi.setGlobals(patch))
	}

	return (
		<>
			{(permissions.media !== 'granted' || !permissions.notifications) && (
				<Alert
					color="warning"
					title={
						permissions.media === 'denied'
							? t('No access to photos and videos')
							: permissions.media === 'limited'
								? t('Access to only some photos and videos')
								: t('Notifications are off')
					}
					actions={
						<Button
							size="sm"
							onClick={() =>
								run(async () => {
									await backupApi.requestPermissions()
									return backupApi.getState()
								})
							}
						>
							{t('Grant access')}
						</Button>
					}
				>
					{permissions.media !== 'granted'
						? t('Backup can only see the photos and videos you allow.')
						: t('Without notifications you will not see backup progress.')}
				</Alert>
			)}

			{state.relinkNeeded && (
				<Alert
					color="error"
					title={t('Backup is paused')}
					className="mt-2"
					actions={
						<Button
							size="sm"
							disabled={!idTag}
							onClick={() =>
								idTag &&
								run(async () => {
									try {
										await relinkDevice(idTag)
									} catch (err) {
										if (err instanceof DeviceAccountMismatchError)
											throw new Error(
												t('This device is linked to a different account.')
											)
										throw err
									}
									return backupApi.getState()
								})
							}
						>
							{t('Link again')}
						</Button>
					}
				>
					{t(
						"The server rejected this device's access key. The device needs to be linked to your account again."
					)}
				</Alert>
			)}

			<Panel title={t('Backup')}>
				{progress ? (
					<>
						<Text as="p">
							{t('Uploading {{done}} of {{total}}', {
								done: progress.done,
								total: progress.total
							})}
						</Text>
						<Progress
							value={progress.total ? (progress.done / progress.total) * 100 : 0}
						/>
					</>
				) : (
					<Text as="p" emphasis="muted">
						{t('Backup is idle')}
					</Text>
				)}
				<Button
					variant="soft"
					className="mt-2"
					disabled={state.running}
					onClick={() => run(backupApi.runNow)}
				>
					{t('Back up now')}
				</Button>
			</Panel>

			<Panel title={t('Defaults')} description={t('Used by every source left on Default')}>
				<Field
					label={t('Upload quality')}
					orientation="horizontal"
					hint={presetDescription(t, globals.defaultPreset)}
				>
					<NativeSelect
						value={globals.defaultPreset}
						onChange={(e) =>
							setGlobals({ defaultPreset: e.target.value as UploadProfile })
						}
					>
						{UPLOAD_PROFILES.map((p) => (
							<option key={p} value={p}>
								{profileLabel(t, p)}
							</option>
						))}
					</NativeSelect>
				</Field>
				<List variant="divided">
					<SwitchRow
						checked={globals.defaultMobileData}
						onChange={(e) => setGlobals({ defaultMobileData: e.target.checked })}
						label={t('Use mobile data')}
					/>
					<SwitchRow
						checked={globals.videosWifiOnly}
						onChange={(e) => setGlobals({ videosWifiOnly: e.target.checked })}
						label={t('Upload videos on Wi-Fi only')}
					/>
					<SwitchRow
						checked={globals.requiresCharging}
						onChange={(e) => setGlobals({ requiresCharging: e.target.checked })}
						label={t('Only while charging')}
					/>
				</List>
			</Panel>

			<Panel title={t('Photos and videos')}>
				{media.length ? (
					<List variant="divided">
						{media.map((s) => (
							<SourceItem key={s.id} source={s} globals={globals} run={run} />
						))}
					</List>
				) : (
					<Text as="p" emphasis="muted">
						{t('No albums found')}
					</Text>
				)}
			</Panel>

			<Panel title={t('Folders')}>
				<List variant="divided">
					{folders.map((s) => (
						<SourceItem key={s.id} source={s} globals={globals} run={run} />
					))}
				</List>
				<Button
					variant="soft"
					className="mt-2"
					onClick={() =>
						run(async () => {
							await backupApi.addFolder()
							return backupApi.getState()
						})
					}
				>
					{t('Add folder')}
				</Button>
			</Panel>

			<Panel title={t('Performance')}>
				<List>
					<SwitchRow
						checked={qrNative}
						onChange={(e) => {
							setQrNativeOff(!e.target.checked)
							setQrNative(e.target.checked)
						}}
						label={t('System QR code detector')}
						description={t('Turn off if QR code scanning is slow')}
					/>
				</List>
			</Panel>
		</>
	)
}

// vim: ts=4
