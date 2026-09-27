// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Field, Input, Panel, Toggle, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../settings/settings.js'

export function TenantSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['auth', 'federation'], {
		level: 'global'
	})

	if (!settings) return null

	const sessionTimeoutSeconds = (settings['auth.session_timeout'] as number) || 86400
	const sessionTimeoutHours = Math.round((sessionTimeoutSeconds / 3600) * 10) / 10

	return (
		<>
			<Panel title={t('Authentication')}>
				<Field
					label={t('Session Timeout')}
					orientation="horizontal"
					hint={`${t('Session timeout in seconds')} (${sessionTimeoutHours} ${t('hours')})`}
				>
					<Input
						className="w-sm"
						name="auth.session_timeout"
						type="number"
						min="60"
						max="31536000"
						value={String(sessionTimeoutSeconds)}
						onChange={onSettingChange}
					/>
				</Field>
			</Panel>

			<Panel title={t('Federation')}>
				<VBox gap={3}>
					<Toggle
						name="federation.auto_accept_followers"
						checked={!!settings['federation.auto_accept_followers']}
						onChange={onSettingChange}
						label={t('Auto-accept follow requests')}
						description={t('Automatically accept follow requests from other instances')}
					/>

					<Field
						label={t('History sync window (days)')}
						orientation="horizontal"
						hint={t('Default age window in days for history sync on new connection.')}
					>
						<Input
							className="w-xs"
							name="federation.history_sync.since_days"
							type="number"
							min="1"
							max="3650"
							value={String(settings['federation.history_sync.since_days'] ?? 30)}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('History sync limit')}
						orientation="horizontal"
						hint={t('Default maximum number of actions to fetch per history sync.')}
					>
						<Input
							className="w-xs"
							name="federation.history_sync.limit"
							type="number"
							min="1"
							max="10000"
							value={String(settings['federation.history_sync.limit'] ?? 10)}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('Key failure cache size')}
						orientation="horizontal"
						hint={t(
							'Maximum entries in the key fetch failure cache (in-memory LRU). Note: takes effect on next process restart.'
						)}
					>
						<Input
							className="w-xs"
							name="federation.key_failure_cache_size"
							type="number"
							min="1"
							max="100000"
							value={String(settings['federation.key_failure_cache_size'] ?? 100)}
							onChange={onSettingChange}
						/>
					</Field>
				</VBox>
			</Panel>
		</>
	)
}

// vim: ts=4
