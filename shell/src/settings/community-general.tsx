// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getInstanceUrl, type ProfilePatch } from '@cloudillo/core'
import { Field, NativeSelect, Panel, Text, Toggle, useApi, useAuth, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { canAdminContext, useActiveCommunity, useApiContext } from '../context/index.js'
import { coerceSettingValue } from '../utils.js'
import { TabConfigEditor } from './profile-tabs.js'

/**
 * `/@<community>/settings/general`: the community's profile tabs and its connection,
 * visibility and federation settings. Everything goes through a proxy token for the
 * community, read from and written to the community's own node.
 */
export function CommunityGeneralSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const { getTokenFor } = useApiContext()
	const idTag = community?.idTag
	const canEdit = !!community && canAdminContext(community, auth?.idTag, 'general')

	const [settings, setSettings] = React.useState<Record<string, string | number | boolean>>({})
	const [x, setX] = React.useState<Record<string, string>>()
	const [loading, setLoading] = React.useState(true)
	const debounceTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})

	// Fetch the community's settings and profile from its own node
	React.useEffect(
		function loadSettings() {
			if (!idTag || !api || !canEdit) {
				setLoading(false)
				return
			}
			setLoading(true)
			setX(undefined)
			let cancelled = false

			;(async function () {
				try {
					// Leader actively administering the community: explicit intent.
					const proxyResult = await getTokenFor(idTag, { explicit: true })
					if (!proxyResult?.token) {
						console.error('Failed to get proxy token for settings')
						return
					}

					const [response, profile] = await Promise.all([
						fetch(`${getInstanceUrl(idTag)}/api/settings?prefix=profile`, {
							headers: {
								Authorization: `Bearer ${proxyResult.token}`,
								'Content-Type': 'application/json'
							}
						}),
						api.profiles.getRemoteFull(idTag, proxyResult.token)
					])
					if (cancelled) return

					if (response.ok) {
						const data = await response.json()
						// API response wraps array in 'data' field (ApiResponse<Vec<SettingResponse>>)
						const settingsArray = data.data || []
						setSettings(
							Object.fromEntries(
								settingsArray.map((s: { key: string; value?: unknown }) => [
									s.key,
									s.value
								])
							)
						)
					}
					setX((profile as { x?: Record<string, string> }).x ?? {})
				} catch (err) {
					console.error('Failed to load community settings:', err)
				} finally {
					if (!cancelled) setLoading(false)
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[idTag, api, getTokenFor, canEdit]
	)

	// Cleanup debounce timers on unmount
	React.useEffect(() => {
		return () => {
			Object.values(debounceTimers.current).forEach((timer) => {
				clearTimeout(timer)
			})
		}
	}, [])

	async function updateProfile(patch: ProfilePatch) {
		if (!idTag) return
		// Explicit user edit — bypass the profile-trust gate and always fetch the proxy token.
		const proxyResult = await getTokenFor(idTag, { explicit: true })
		if (!proxyResult?.token) throw new Error('Failed to get proxy token')
		const response = await fetch(`${getInstanceUrl(idTag)}/api/me`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${proxyResult.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(patch)
		})
		if (!response.ok) throw new Error(`Profile update failed: ${response.status}`)
	}

	async function onSettingChange(
		evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
	) {
		if (!idTag) return

		const { name, type } = evt.target
		const oldValue = settings[name]

		const value = coerceSettingValue(evt.target, oldValue)
		if (value === undefined) {
			// Empty/partial numeric input (e.g. '' or '-'): keep what the user typed
			// locally so the controlled input isn't reverted, but don't persist a bad
			// value to the typed-settings backend. (See M1.)
			setSettings((prev) => ({ ...prev, [name]: evt.target.value }))
			return
		}

		// Update local state immediately
		setSettings((prev) => ({ ...prev, [name]: value }))

		// Clear existing timer
		if (debounceTimers.current[name]) {
			clearTimeout(debounceTimers.current[name])
		}

		// Debounce for text inputs, immediate for toggles/selects
		const delay = type === 'checkbox' ? 0 : type === 'text' ? 800 : 300

		const saveToServer = async () => {
			try {
				// Explicit user action: writing a community setting.
				const proxyResult = await getTokenFor(idTag, { explicit: true })
				if (!proxyResult?.token) return

				await fetch(`${getInstanceUrl(idTag)}/api/settings/${encodeURIComponent(name)}`, {
					method: 'PUT',
					headers: {
						Authorization: `Bearer ${proxyResult.token}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ value })
				})
			} catch (err) {
				console.error('Failed to save setting:', name, err)
			}
		}

		if (delay === 0) {
			await saveToServer()
		} else {
			debounceTimers.current[name] = setTimeout(saveToServer, delay)
		}
	}

	if (!community) return null

	if (!canEdit) {
		return (
			<Panel padding={3}>
				<Text as="p" emphasis="muted">
					{t('You need leader permissions to access community settings.')}
				</Text>
			</Panel>
		)
	}

	if (loading) {
		return (
			<Panel padding={3}>
				<Text as="p" emphasis="muted">
					{t('Loading settings...')}
				</Text>
			</Panel>
		)
	}

	return (
		<>
			{x && <TabConfigEditor key={idTag} x={x} save={updateProfile} isCommunity />}

			<Panel padding={3} className="mb-2" title={t('Connections')} headingLevel={4}>
				<VBox gap={3}>
					<Field
						orientation="horizontal"
						label={t('Connection Mode')}
						hint={
							<>
								{t(
									'Controls how connection requests to this community are handled.'
								)}{' '}
								{settings['profile.connection_mode'] === 'A'
									? t('Anyone can join immediately.')
									: settings['profile.connection_mode'] === 'I'
										? t(
												'Connection requests are auto-rejected. Members can only join via an invitation from a leader or moderator.'
											)
										: t(
												'A leader or moderator must approve each connection request.'
											)}
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
							<option value="I">{t('Invite only')}</option>
						</NativeSelect>
					</Field>

					<Toggle
						color="primary"
						name="profile.allow_followers"
						checked={settings['profile.allow_followers'] !== false}
						onChange={onSettingChange}
						label={t('Allow followers')}
						description={t(
							'Allow users to follow this community without becoming members.'
						)}
					/>
				</VBox>
			</Panel>

			<Panel padding={3} className="mb-2" title={t('Post visibility')} headingLevel={4}>
				<Field
					orientation="horizontal"
					label={t('Visibility cap')}
					hint={t(
						'Limits the maximum visibility of posts in this community. Members cannot publish posts more public than this setting.'
					)}
				>
					<NativeSelect
						name="profile.visibility_cap"
						value={(settings['profile.visibility_cap'] as string) ?? 'P'}
						onChange={onSettingChange}
					>
						<option value="P">{t('Public (no limit)')}</option>
						<option value="F">{t('Followers')}</option>
						<option value="C">{t('Connected')}</option>
					</NativeSelect>
				</Field>
			</Panel>

			<Panel padding={3} className="mb-2" title={t('Federation')} headingLevel={4}>
				<Toggle
					color="primary"
					name="profile.auto_approve_actions"
					checked={settings['profile.auto_approve_actions'] === true}
					onChange={onSettingChange}
					label={t('Auto-approve incoming actions')}
					description={t(
						'When enabled, posts and messages from trusted sources are automatically approved.'
					)}
				/>
			</Panel>

			<Panel padding={3} className="mb-2" title={t('Partner communities')} headingLevel={4}>
				<Toggle
					color="primary"
					name="profile.partners_public"
					checked={settings['profile.partners_public'] !== false}
					onChange={onSettingChange}
					label={t('Show partner communities publicly')}
					description={t('Members always see the partner list.')}
				/>
			</Panel>
		</>
	)
}

// vim: ts=4
