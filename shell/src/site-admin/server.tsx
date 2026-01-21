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

export function ServerSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['server'])

	if (!settings) return null

	return (
		<>
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
		</>
	)
}

// vim: ts=4
