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

import { useApi } from '@cloudillo/react'

import { useSettings } from './settings.js'

export function PrivacySettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { settings, onSettingChange } = useSettings('privacy')

	if (!settings) return null

	return (
		<>
			<div className="c-panel">
				<h4 className="pb-2">{t('Post visibility')}</h4>
				<label className="c-settings-field">
					<span>{t('Default visibility for new posts')}</span>
					<select
						className="c-select"
						name="privacy.default_visibility"
						value={(settings['privacy.default_visibility'] as string) || 'F'}
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
						name="privacy.allow_followers"
						type="checkbox"
						checked={settings['privacy.allow_followers'] !== false}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint">
					{t(
						'When disabled, new follow requests will be rejected and your posts will only be visible to your connections.'
					)}
				</p>
			</div>
		</>
	)
}

// vim: ts=4
