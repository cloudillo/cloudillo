// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingSpinner } from '@cloudillo/react'

import { useSettings } from './settings.js'

const getVariantOptions = (t: TFunction) => [
	{ value: 'tn', label: t('Thumbnail (tn)') },
	{ value: 'sd', label: t('Standard (sd)') },
	{ value: 'md', label: t('Medium (md)') },
	{ value: 'hd', label: t('High (hd)') },
	{ value: 'xd', label: t('Extra (xd)') }
]

export function FilesSettings() {
	const { t } = useTranslation()
	const variantOptions = React.useMemo(() => getVariantOptions(t), [t])
	// Audio doesn't have thumbnail variant
	const audioVariantOptions = React.useMemo(
		() => variantOptions.filter((o) => o.value !== 'tn'),
		[variantOptions]
	)

	const { settings, onSettingChange } = useSettings('file')

	if (!settings) return <LoadingSpinner />

	return (
		<div className="c-panel">
			<h4>{t('File Synchronization')}</h4>
			<p className="text-muted">
				{t('Control which file variants are synchronized to your device')}
			</p>

			<label className="c-settings-field">
				<span>{t('Max image quality')}</span>
				<select
					className="c-select"
					name="file.sync_max_vis"
					value={(settings['file.sync_max_vis'] as string) || 'md'}
					onChange={onSettingChange}
				>
					{variantOptions.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</label>

			<label className="c-settings-field">
				<span>{t('Max video quality')}</span>
				<select
					className="c-select"
					name="file.sync_max_vid"
					value={(settings['file.sync_max_vid'] as string) || 'sd'}
					onChange={onSettingChange}
				>
					{variantOptions.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</label>

			<label className="c-settings-field">
				<span>{t('Max audio quality')}</span>
				<select
					className="c-select"
					name="file.sync_max_aud"
					value={(settings['file.sync_max_aud'] as string) || 'md'}
					onChange={onSettingChange}
				>
					{audioVariantOptions.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</label>
		</div>
	)
}

// vim: ts=4
