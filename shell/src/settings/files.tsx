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

import { useSettings } from './settings.js'

const VARIANT_OPTIONS = [
	{ value: 'tn', label: 'Thumbnail (tn)' },
	{ value: 'sd', label: 'Standard (sd)' },
	{ value: 'md', label: 'Medium (md)' },
	{ value: 'hd', label: 'High (hd)' },
	{ value: 'xd', label: 'Extra (xd)' }
]

// Audio doesn't have thumbnail variant
const AUDIO_VARIANT_OPTIONS = VARIANT_OPTIONS.filter((o) => o.value !== 'tn')

export function FilesSettings() {
	const { t } = useTranslation()

	const { settings, onSettingChange } = useSettings('file')

	if (!settings) return null

	return (
		<>
			<div className="c-panel">
				<h4>{t('File Synchronization')}</h4>
				<p className="text-muted">
					{t('Control which file variants are synchronized to your device')}
				</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Max image quality')}</span>
					<select
						className="c-select"
						name="file.sync_max_vis"
						value={(settings['file.sync_max_vis'] as string) || 'md'}
						onChange={onSettingChange}
					>
						{VARIANT_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{t(opt.label)}
							</option>
						))}
					</select>
				</label>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Max video quality')}</span>
					<select
						className="c-select"
						name="file.sync_max_vid"
						value={(settings['file.sync_max_vid'] as string) || 'sd'}
						onChange={onSettingChange}
					>
						{VARIANT_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{t(opt.label)}
							</option>
						))}
					</select>
				</label>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Max audio quality')}</span>
					<select
						className="c-select"
						name="file.sync_max_aud"
						value={(settings['file.sync_max_aud'] as string) || 'md'}
						onChange={onSettingChange}
					>
						{AUDIO_VARIANT_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{t(opt.label)}
							</option>
						))}
					</select>
				</label>
			</div>
		</>
	)
}

// vim: ts=4
