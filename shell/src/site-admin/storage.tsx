// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Field, Input, NativeSelect, Panel, Toggle, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../settings/settings.js'

export function StorageSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['file', 'limits'], { level: 'global' })

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

	const variantOpts = variantOptions.map((opt) => (
		<option key={opt.value} value={opt.value}>
			{opt.label}
		</option>
	))
	const imageFormatOpts = imageFormatOptions.map((opt) => (
		<option key={opt.value} value={opt.value}>
			{opt.label}
		</option>
	))
	const avifNote = t('Note: AVIF provides best compression but can be slow to encode')

	return (
		<>
			<Panel title={t('Global Settings')}>
				<VBox gap={3}>
					<Field
						label={t('Maximum file upload size (MB)')}
						orientation="horizontal"
						hint={t('Maximum size for individual file uploads')}
					>
						<Input
							className="w-xs"
							name="file.max_file_size_mb"
							type="number"
							min="1"
							max="10000"
							value={String(settings['file.max_file_size_mb'] || 100)}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('Maximum streaming file size (MB)')}
						orientation="horizontal"
						hint={t('Maximum size for streaming uploads (video/audio)')}
					>
						<Input
							className="w-xs"
							name="file.max_streaming_file_size_mb"
							type="number"
							min="1"
							max="10000"
							value={String(settings['file.max_streaming_file_size_mb'] || 100)}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('Maximum size variant to generate')}
						orientation="horizontal"
						hint={t('Largest image size variant to automatically generate and store')}
					>
						<NativeSelect
							className="w-sm"
							name="file.max_generate_variant"
							value={(settings['file.max_generate_variant'] as string) || 'hd'}
							onChange={onSettingChange}
						>
							{variantOpts}
						</NativeSelect>
					</Field>

					<Field
						label={t('Maximum size variant to cache')}
						orientation="horizontal"
						hint={t(
							'Largest image size variant to download and cache from remote instances'
						)}
					>
						<NativeSelect
							className="w-sm"
							name="file.max_cache_variant"
							value={(settings['file.max_cache_variant'] as string) || 'md'}
							onChange={onSettingChange}
						>
							{variantOpts}
						</NativeSelect>
					</Field>

					<Field
						label={t('Thumbnail format')}
						orientation="horizontal"
						hint={`${t('Image format for thumbnail (tn) variant')}. ${avifNote}`}
					>
						<NativeSelect
							className="w-sm"
							name="file.thumbnail_format"
							value={(settings['file.thumbnail_format'] as string) || 'webp'}
							onChange={onSettingChange}
						>
							{imageFormatOpts}
						</NativeSelect>
					</Field>

					<Field
						label={t('Image format for larger variants')}
						orientation="horizontal"
						hint={`${t('Image format for sd, md, hd, and xd variants')}. ${avifNote}`}
					>
						<NativeSelect
							className="w-sm"
							name="file.image_format"
							value={(settings['file.image_format'] as string) || 'webp'}
							onChange={onSettingChange}
						>
							{imageFormatOpts}
						</NativeSelect>
					</Field>
				</VBox>
			</Panel>

			<Panel
				title={t('Default Tenant Limits')}
				description={t(
					'Defaults applied to every tenant unless overridden on Site admin → Tenants → (select a tenant).'
				)}
			>
				<VBox gap={3}>
					<Field
						label={t('Default storage quota (GB)')}
						orientation="horizontal"
						hint={t('Default storage quota for every tenant.')}
					>
						<Input
							className="w-xs"
							name="limits.max_storage_gb"
							type="number"
							min="1"
							max="100000"
							value={String(settings['limits.max_storage_gb'] || 100)}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('Variant sync timeout (seconds)')}
						orientation="horizontal"
						hint={t(
							'Per-attachment variant sync timeout (seconds; default applied to all tenants unless overridden).'
						)}
					>
						<Input
							className="w-xs"
							name="file.sync_variant_timeout_secs"
							type="number"
							min="10"
							max="86400"
							value={String(settings['file.sync_variant_timeout_secs'] || 300)}
							onChange={onSettingChange}
						/>
					</Field>
				</VBox>
			</Panel>

			<Panel title={t('Federated attachments')}>
				<Toggle
					name="file.shared_blob_store_enabled"
					checked={!!settings['file.shared_blob_store_enabled']}
					onChange={onSettingChange}
					label={t('Use shared blob store for public attachments')}
					description={t(
						'Use the shared TnId(0) blob store for Public/Verified federated attachments (deduplicates across tenants).'
					)}
				/>
			</Panel>

			<Panel title={t('Garbage collection')}>
				<VBox gap={3}>
					<Field
						label={t('GC schedule (cron)')}
						orientation="horizontal"
						hint={t(
							"Cron expression for the GC schedule (5-field: 'minute hour day month weekday')."
						)}
					>
						<Input
							className="w-sm"
							name="file.gc_cron"
							type="text"
							value={String(settings['file.gc_cron'] ?? '0 4 * * *')}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('Safety window (seconds)')}
						orientation="horizontal"
						hint={t(
							'Minimum age (seconds) before an unreferenced managed file row or orphan blob becomes eligible for GC — protects against sync-in-progress and wiring-up races.'
						)}
					>
						<Input
							className="w-xs"
							name="file.gc_safety_window_secs"
							type="number"
							min="0"
							max="2592000"
							value={String(settings['file.gc_safety_window_secs'] ?? 3600)}
							onChange={onSettingChange}
						/>
					</Field>
				</VBox>
			</Panel>
		</>
	)
}

// vim: ts=4
