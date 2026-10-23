// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { parseTileSources } from '@cloudillo/core'
import {
	Button,
	Field,
	HBox,
	Input,
	List,
	NativeSelect,
	Panel,
	TextArea,
	useApi,
	useDialog,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { SettingsDenied, SwitchRow, useSettings } from '../settings/settings.js'

type PeerMode = 'open' | 'allowlist' | 'off'

interface PeerPolicy {
	mode: PeerMode
	allow: string[]
}

/**
 * `map.tile_sources`: `[{name,url,attribution}]`, https URLs only (the backend validates too),
 * unique names (Mapillo uses the name as the layer id)
 */
function validateTileSourcesJson(text: string): unknown[] | undefined {
	try {
		const value: unknown = JSON.parse(text)
		// A dropped entry or a repeated name makes the lengths differ
		return Array.isArray(value) && parseTileSources(value).length === value.length
			? value
			: undefined
	} catch {
		return undefined
	}
}

export function ServerSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const dialog = useDialog()
	const { settings, setSettings, onSettingChange, denied } = useSettings(
		['auth', 'federation', 'notify', 'onboarding', 'map', 'audit'],
		{ level: 'global' }
	)
	// Settings are raw global rows here: a key that is absent uses the server default.
	const rawPeers = settings?.['federation.peers'] as unknown as Partial<PeerPolicy> | undefined
	const peers: PeerPolicy = {
		mode: rawPeers?.mode ?? 'open',
		allow: Array.isArray(rawPeers?.allow) ? rawPeers.allow : []
	}
	const rawTiles = settings?.['map.tile_sources'] as unknown
	// A mode picked but not saved yet: an allow list with no entries would cut all federation
	const [pendingMode, setPendingMode] = React.useState<PeerMode | undefined>()
	const mode = pendingMode ?? peers.mode
	const [allowText, setAllowText] = React.useState<string | undefined>()
	const [allowError, setAllowError] = React.useState<string | undefined>()
	const [tilesText, setTilesText] = React.useState<string | undefined>()
	const [tilesError, setTilesError] = React.useState<string | undefined>()
	const [communityText, setCommunityText] = React.useState<string | undefined>()

	// JSON settings bypass `onSettingChange`, which only persists scalars.
	async function saveJson(name: string, value: unknown): Promise<boolean> {
		if (!api) return false
		try {
			if (value === undefined) {
				await api.settings.delete(name, { level: 'global' })
			} else {
				await api.settings.update(name, { value }, { level: 'global' })
			}
			setSettings((s) => {
				const next = { ...s }
				if (value === undefined) delete next[name]
				else next[name] = value as string
				return next
			})
			return true
		} catch (err) {
			console.error('Failed to update setting:', name, err)
			toastError(t('Failed to save setting. Please try again.'))
			return false
		}
	}

	async function onModeChange(evt: React.ChangeEvent<HTMLSelectElement>) {
		const next = evt.target.value as PeerMode
		if (next === 'allowlist' && !peers.allow.length) {
			setPendingMode(next)
			return
		}
		// The select is controlled by `mode`, so a cancel snaps it back
		if (
			next === 'off' &&
			!(await dialog.confirm(
				t('Turn off federation'),
				t('This server will stop exchanging data with all other servers.'),
				{ color: 'error', confirmLabel: t('Turn off') }
			))
		)
			return
		if (await saveJson('federation.peers', { ...peers, mode: next })) {
			setPendingMode(undefined)
			setAllowError(undefined)
		}
	}

	async function onAllowBlur() {
		// A pending allow list is checked even untouched: it has no entries yet
		if (allowText === undefined && pendingMode === undefined) return
		const allow = (allowText ?? peers.allow.join('\n'))
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
		if (mode === 'allowlist' && !allow.length) {
			setAllowError(t('Add at least one peer to use the allow list.'))
			return
		}
		if (await saveJson('federation.peers', { mode, allow })) {
			setAllowText(undefined)
			setPendingMode(undefined)
			setAllowError(undefined)
		}
	}

	async function onTilesBlur() {
		if (tilesText === undefined) return
		if (!tilesText.trim()) {
			setTilesError(undefined)
			if (rawTiles === undefined || (await saveJson('map.tile_sources', undefined))) {
				setTilesText(undefined)
			}
			return
		}
		const value = validateTileSourcesJson(tilesText)
		if (!value) {
			setTilesError(t('Invalid tile source list'))
			return
		}
		setTilesError(undefined)
		if (await saveJson('map.tile_sources', value)) setTilesText(undefined)
	}

	if (denied) return <SettingsDenied />
	if (!settings) return null

	const community = settings['onboarding.community'] as string | undefined

	// Saved on blur, not per keystroke: a half-typed idTag must not become the suggestion.
	// An empty value is an explicit "None".
	async function onCommunityBlur() {
		if (communityText === undefined) return
		const value = communityText.trim()
		if (value === (community ?? '') || (await saveJson('onboarding.community', value))) {
			setCommunityText(undefined)
		}
	}

	return (
		<>
			<Panel title={t('Server')}>
				<Field
					label={t('Two-factor authentication')}
					orientation="horizontal"
					hint={t(
						'Passkey and QR sign-ins never ask for a code. When required, users without an authenticator app must set one up at their next password sign-in.'
					)}
				>
					<NativeSelect
						name="auth.mfa"
						value={(settings['auth.mfa'] as string | undefined) ?? 'off'}
						onChange={onSettingChange}
					>
						<option value="off">{t('Off')}</option>
						<option value="optional">{t('Optional')}</option>
						<option value="required">{t('Required')}</option>
					</NativeSelect>
				</Field>
				<Field
					label={t('Security alert e-mail')}
					hint={t(
						'Address that receives security alerts from the audit log. Leave empty to turn alerts off.'
					)}
				>
					<Input
						name="audit.alert_email"
						type="email"
						autoComplete="email"
						value={(settings['audit.alert_email'] as string | undefined) ?? ''}
						onChange={onSettingChange}
					/>
				</Field>
			</Panel>

			<Panel title={t('Federation')}>
				<Field
					label={t('Federation peers')}
					orientation="horizontal"
					hint={t(
						'Which other servers this server exchanges data with. Users hosted on this server are never affected.'
					)}
				>
					<NativeSelect name="federation.peers.mode" value={mode} onChange={onModeChange}>
						<option value="open">{t('Open')}</option>
						<option value="allowlist">{t('Allow list')}</option>
						<option value="off">{t('Off')}</option>
					</NativeSelect>
				</Field>
				{mode === 'allowlist' && (
					<Field
						label={t('Allowed peers')}
						error={allowError}
						hint={t(
							'One entry per line: an identity (example.org) or a domain wildcard (*.example.org, which does not match example.org itself).'
						)}
					>
						<TextArea
							name="federation.peers.allow"
							rows={5}
							value={allowText ?? peers.allow.join('\n')}
							onChange={(evt: React.ChangeEvent<HTMLTextAreaElement>) =>
								setAllowText(evt.target.value)
							}
							onBlur={onAllowBlur}
						/>
					</Field>
				)}
			</Panel>

			<Panel title={t('Onboarding and notifications')}>
				<Field
					label={t('Onboarding community')}
					hint={t('Community suggested to new users during onboarding.')}
				>
					<HBox gap={2} align="center">
						<Input
							name="onboarding.community"
							value={communityText ?? community ?? ''}
							placeholder={community === undefined ? t('Server default') : t('None')}
							onChange={(e) => setCommunityText(e.target.value)}
							onBlur={onCommunityBlur}
						/>
						{community !== undefined && (
							<Button
								size="sm"
								onClick={async () => {
									if (await saveJson('onboarding.community', undefined)) {
										setCommunityText(undefined)
									}
								}}
							>
								{t('Reset to default')}
							</Button>
						)}
					</HBox>
				</Field>
				<List variant="divided">
					<SwitchRow
						name="notify.push_allowed"
						checked={settings['notify.push_allowed'] !== false}
						onChange={onSettingChange}
						label={t('Allow push notifications')}
						description={t(
							'When off, users cannot enable push notifications on their devices.'
						)}
					/>
				</List>
			</Panel>

			<Panel title={t('Maps')}>
				<Field
					label={t('Map tile sources')}
					error={tilesError}
					hint={t(
						'JSON list of {"name", "url", "attribution"} entries with https URLs. Leave empty to use the server default; an empty list [] disables Mapillo.'
					)}
				>
					<TextArea
						name="map.tile_sources"
						rows={8}
						placeholder={t('Server default')}
						value={
							tilesText ??
							(rawTiles === undefined ? '' : JSON.stringify(rawTiles, null, 2))
						}
						onChange={(evt: React.ChangeEvent<HTMLTextAreaElement>) =>
							setTilesText(evt.target.value)
						}
						onBlur={onTilesBlur}
					/>
				</Field>
			</Panel>
		</>
	)
}

// vim: ts=4
