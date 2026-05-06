// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useApi, LoadingSpinner } from '@cloudillo/react'

import { useSettings } from './settings.js'

export function PrivacySettings() {
	const { t } = useTranslation()
	useApi()
	const { settings, onSettingChange } = useSettings('profile')

	if (!settings) return <LoadingSpinner />

	return (
		<>
			<div className="c-panel">
				<h4 className="pb-2">{t('Post visibility')}</h4>
				<label className="c-settings-field">
					<span>{t('Default visibility for new posts')}</span>
					<select
						className="c-select"
						name="profile.default_visibility"
						value={(settings['profile.default_visibility'] as string) || 'F'}
						onChange={onSettingChange}
					>
						<option value="F">{t('Followers')}</option>
						<option value="C">{t('Connected')}</option>
						<option value="P">{t('Public')}</option>
					</select>
				</label>
				<p className="c-hint">
					{t('You can change visibility for individual posts when creating them.')}
				</p>
			</div>

			<div className="c-panel">
				<h4 className="pb-2">{t('Followers')}</h4>
				<label className="c-settings-field">
					<span>{t('Allow others to follow you')}</span>
					<input
						className="c-toggle primary"
						name="profile.allow_followers"
						type="checkbox"
						checked={settings['profile.allow_followers'] !== false}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint">
					{t(
						'When disabled, new follow requests will be rejected and your posts will only be visible to your connections.'
					)}
				</p>
			</div>

			<div className="c-panel">
				<h4 className="pb-2">{t('Connections')}</h4>
				<label className="c-settings-field">
					<span>{t('Connection mode')}</span>
					<select
						className="c-select"
						name="profile.connection_mode"
						value={(settings['profile.connection_mode'] as string) ?? 'M'}
						onChange={onSettingChange}
					>
						<option value="M">{t('Manual approval')}</option>
						<option value="A">{t('Auto-accept')}</option>
						<option value="I">{t('Ignore (reject all)')}</option>
					</select>
				</label>
				<p className="c-hint">
					{t('Controls how connection requests to your profile are handled.')}{' '}
					{settings['profile.connection_mode'] === 'A'
						? t('Anyone can connect with you immediately.')
						: settings['profile.connection_mode'] === 'I'
							? t('Connection requests are automatically rejected.')
							: t('You will be asked to approve each connection request.')}
				</p>
			</div>

			<div className="c-panel">
				<h4 className="pb-2">{t('Federation')}</h4>
				<label className="c-settings-field">
					<span>{t('Auto-approve incoming actions')}</span>
					<input
						className="c-toggle primary"
						name="profile.auto_approve_actions"
						type="checkbox"
						checked={!!settings['profile.auto_approve_actions']}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint">
					{t(
						'When enabled, posts and messages from trusted sources are automatically approved without manual review.'
					)}
				</p>
			</div>
		</>
	)
}

// vim: ts=4
