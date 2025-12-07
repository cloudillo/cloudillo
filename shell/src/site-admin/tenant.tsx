// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../settings/settings.js'

export function TenantSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['auth', 'federation', 'limits'])

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
						className="c-input"
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

			<div className="c-panel">
				<h4>{t('Storage')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Maximum Storage Quota (GB)')}</span>
					<input
						className="c-input"
						name="limits.max_storage_gb"
						type="number"
						min="1"
						max="100000"
						value={String(settings['limits.max_storage_gb'] || 100)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Total storage quota for this tenant')}</p>
			</div>
		</>
	)
}

// vim: ts=4
