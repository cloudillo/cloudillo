// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Field,
	List,
	LoadingSpinner,
	NativeSelect,
	Panel,
	useApi,
	type VisibilityCode,
	VisibilitySelect
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow, useSettings } from './settings.js'

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
		</>
	)
}

// vim: ts=4
