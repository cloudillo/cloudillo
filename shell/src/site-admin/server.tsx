// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../settings/settings.js'

export function ServerSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['server'])

	if (!settings) return null

	return (
		<div className="c-panel">
			<h4>{t('Server')}</h4>

			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Allow new user registrations')}</span>
				<input
					className="c-toggle primary"
					name="server.registration_enabled"
					type="checkbox"
					checked={!!settings['server.registration_enabled']}
					onChange={onSettingChange}
				/>
			</label>
			<p className="c-hint mb-4">
				{t('Controls whether new users can register on this instance')}
			</p>
		</div>
	)
}

// vim: ts=4
