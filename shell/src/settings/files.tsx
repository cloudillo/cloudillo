// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, LoadingSpinner, useAuth, useDialog, useToast } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { activeContextAtom, isContextLeader, useContextAwareApi } from '../context/index.js'
import { useSettings } from './settings.js'

const getVariantOptions = (t: TFunction) => [
	{ value: 'tn', label: t('Thumbnail (tn)') },
	{ value: 'sd', label: t('Standard (sd)') },
	{ value: 'md', label: t('Medium (md)') },
	{ value: 'hd', label: t('High (hd)') },
	{ value: 'xd', label: t('Extra (xd)') }
]

export function FilesSettings() {
	const { t } = useTranslation()
	const variantOptions = React.useMemo(() => getVariantOptions(t), [t])
	// Audio doesn't have thumbnail variant
	const audioVariantOptions = React.useMemo(
		() => variantOptions.filter((o) => o.value !== 'tn'),
		[variantOptions]
	)

	const { settings, onSettingChange } = useSettings('file')

	const [auth] = useAuth()
	const activeContext = useAtomValue(activeContextAtom)
	// Deliberately not `useSettings`: that hook writes through `useApi()`, bound to the
	// user's own idTag, while the reindex this change asks for must run on the active
	// context's tenant. Reading and writing through the same `contextApi` keeps both on
	// one tenant, and lets a community leader configure the community's index.
	const { api: contextApi } = useContextAwareApi()
	const dialog = useDialog()
	const { toast } = useToast()
	const [storeText, setStoreText] = React.useState<boolean | undefined>()
	// The GET is the only way in: without a surfaced failure and a retry, one offline
	// moment leaves the leader looking at a panel that never arrives.
	const [storeTextError, setStoreTextError] = React.useState(false)
	const [reloadKey, setReloadKey] = React.useState(0)
	const [busy, setBusy] = React.useState(false)
	// Mirrors the backend: search.store_text is PermissionLevel::User (owner/leader)
	// and POST /api/search/reindex is require_leader.
	const canManageIndex = isContextLeader(activeContext, auth?.idTag)

	React.useEffect(
		function loadStoreText() {
			// Nothing of the previous tenant's may stay on the toggle while the new one
			// loads: the next save would write it to the tenant now in view.
			setStoreText(undefined)
			setStoreTextError(false)
			if (!contextApi || !canManageIndex) return
			let cancelled = false
			contextApi.settings
				.get('search.store_text')
				// No `level`, so the full chain (tenant → global → schema default)
				// resolves and the `true` default arrives even when no row was ever
				// written — hence `!== false`, not `!!`.
				.then((res) => {
					if (cancelled) return
					setStoreText(res.value !== false)
				})
				.catch((err) => {
					if (cancelled) return
					console.error('Failed to load search.store_text:', err)
					setStoreTextError(true)
				})
			// Cancelled on context switch: a request outstanding across it would land
			// the old tenant's value in the toggle.
			return () => {
				cancelled = true
			}
		},
		[contextApi, canManageIndex, reloadKey]
	)

	// Saves first, then offers the rebuild: declining leaves the index stale but
	// self-healing — the server folds this setting into its staleness watermark, so the
	// next startup sweep rebuilds anyway.
	async function handleStoreTextChange(evt: React.ChangeEvent<HTMLInputElement>) {
		const next = evt.target.checked
		if (!contextApi) return
		setStoreText(next)
		setBusy(true)
		try {
			await contextApi.settings.update('search.store_text', { value: next })
		} catch (err: unknown) {
			setStoreText(!next)
			if (err instanceof Error) await dialog.tell(t('Error'), err.message)
			return
		} finally {
			setBusy(false)
		}
		const confirmed = await dialog.confirm(
			t('Rebuild search index?'),
			t(
				'Search results will be incomplete until the index is rebuilt. This runs in the background and may take several minutes. Rebuild now?'
			)
		)
		if (!confirmed) return
		try {
			await contextApi.search.reindex()
			toast({
				variant: 'info',
				title: t('Rebuilding search index'),
				message: t('This runs in the background. You will be notified when it finishes.')
			})
		} catch (err: unknown) {
			if (err instanceof Error) await dialog.tell(t('Error'), err.message)
		}
	}

	if (!settings) return <LoadingSpinner />

	return (
		<>
			<div className="c-panel">
				<h4>{t('File Synchronization')}</h4>
				<p className="text-muted">
					{t('Control which file variants are synchronized to your device')}
				</p>

				<label className="c-settings-field">
					<span>{t('Max image quality')}</span>
					<select
						className="c-select"
						name="file.sync_max_vis"
						value={(settings['file.sync_max_vis'] as string) || 'md'}
						onChange={onSettingChange}
					>
						{variantOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>

				<label className="c-settings-field">
					<span>{t('Max video quality')}</span>
					<select
						className="c-select"
						name="file.sync_max_vid"
						value={(settings['file.sync_max_vid'] as string) || 'sd'}
						onChange={onSettingChange}
					>
						{variantOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>

				<label className="c-settings-field">
					<span>{t('Max audio quality')}</span>
					<select
						className="c-select"
						name="file.sync_max_aud"
						value={(settings['file.sync_max_aud'] as string) || 'md'}
						onChange={onSettingChange}
					>
						{audioVariantOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
			</div>

			{canManageIndex && (
				<div className="c-panel">
					<h4>{t('Search index')}</h4>
					{/* Heading and hint stay put in all three states, so the panel
					    does not jump as the value lands. */}
					{storeText !== undefined ? (
						<label className="c-settings-field">
							<span>{t('Store indexed document text')}</span>
							<input
								className="c-toggle primary"
								type="checkbox"
								checked={storeText}
								disabled={busy}
								onChange={handleStoreTextChange}
							/>
						</label>
					) : storeTextError ? (
						<div className="c-settings-field">
							<span className="text-danger">
								{t('Failed to load the search index setting.')}
							</span>
							<Button onClick={() => setReloadKey((key) => key + 1)}>
								{t('Retry')}
							</Button>
						</div>
					) : (
						<div className="c-settings-field">
							<span>{t('Store indexed document text')}</span>
							<LoadingSpinner size="sm" />
						</div>
					)}
					<p className="c-hint">
						{t(
							'Keeps a plain-text copy of your documents and posts alongside the search index so results can show highlighted snippets. Turning this off makes the index substantially smaller; search still works, but snippets are no longer available.'
						)}
					</p>
				</div>
			)}
		</>
	)
}

// vim: ts=4
