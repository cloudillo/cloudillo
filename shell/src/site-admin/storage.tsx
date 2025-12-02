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

export function StorageSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['file', 'limits'])

	if (!settings) return null

	const variantOptions = [
		{ value: 'tn', label: 'Thumbnail' },
		{ value: 'sd', label: 'SD (720p)' },
		{ value: 'md', label: 'MD (1280p)' },
		{ value: 'hd', label: 'HD (1920p)' },
		{ value: 'xd', label: 'XD (3840p / 4K)' }
	]

	const imageFormatOptions = [
		{ value: 'avif', label: 'AVIF (best compression)' },
		{ value: 'webp', label: 'WebP (good compression)' },
		{ value: 'jpeg', label: 'JPEG (compatible)' },
		{ value: 'png', label: 'PNG (lossless)' }
	]

	return (
		<>
			<div className="c-panel">
				<h4>{t('Global Settings')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Maximum file upload size (MB)')}</span>
					<input
						className="c-input"
						name="file.max_file_size_mb"
						type="number"
						min="1"
						max="10000"
						value={String(settings['file.max_file_size_mb'] || 100)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Maximum size for individual file uploads')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Maximum size variant to generate')}</span>
					<select
						className="c-select"
						name="file.max_generate_variant"
						value={(settings['file.max_generate_variant'] as string) || 'hd'}
						onChange={onSettingChange}
					>
						{variantOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
				<p className="c-hint mb-4">
					{t('Largest image size variant to automatically generate and store')}
				</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Maximum size variant to cache')}</span>
					<select
						className="c-select"
						name="file.max_cache_variant"
						value={(settings['file.max_cache_variant'] as string) || 'md'}
						onChange={onSettingChange}
					>
						{variantOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
				<p className="c-hint mb-4">
					{t('Largest image size variant to download and cache from remote instances')}
				</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Thumbnail format')}</span>
					<select
						className="c-select"
						name="file.thumbnail_format"
						value={(settings['file.thumbnail_format'] as string) || 'webp'}
						onChange={onSettingChange}
					>
						{imageFormatOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
				<p className="c-hint mb-4">
					{t('Image format for thumbnail (tn) variant')}.{' '}
					{t('Note: AVIF provides best compression but can be slow to encode')}
				</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Image format for larger variants')}</span>
					<select
						className="c-select"
						name="file.image_format"
						value={(settings['file.image_format'] as string) || 'webp'}
						onChange={onSettingChange}
					>
						{imageFormatOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
				<p className="c-hint mb-4">
					{t('Image format for sd, md, hd, and xd variants')}.{' '}
					{t('Note: AVIF provides best compression but can be slow to encode')}
				</p>
			</div>

			<div className="c-panel">
				<h4>{t('Per-Tenant Limits')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Maximum storage quota (GB)')}</span>
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
				<p className="c-hint mb-4">{t('Total storage quota for each tenant')}</p>
			</div>
		</>
	)
}

// vim: ts=4
