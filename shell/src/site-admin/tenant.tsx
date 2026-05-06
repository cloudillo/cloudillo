// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
			<div className="c-panel">
				<h4>{t('Authentication')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Session Timeout')}</span>
					<input
						className="c-input w-sm"
						name="auth.session_timeout"
						type="number"
						min="60"
						max="31536000"
						value={String(sessionTimeoutSeconds)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">
					{t('Session timeout in seconds')} ({sessionTimeoutHours} {t('hours')})
				</p>
			</div>

			<div className="c-panel">
				<h4>{t('Federation')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Auto-accept follow requests')}</span>
					<input
						className="c-toggle"
						name="federation.auto_accept_followers"
						type="checkbox"
						checked={!!settings['federation.auto_accept_followers']}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">
					{t('Automatically accept follow requests from other instances')}
				</p>
			</div>
		</>
	)
}

// vim: ts=4
