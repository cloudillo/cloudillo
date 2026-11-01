// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { IcClose, IcSettings } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { MapilloSettings, OverpassServer } from './types.js'
import { OVERPASS_SERVERS } from './types.js'

interface SettingsPanelProps {
	settings: MapilloSettings
	onSettingsChange: (changes: Partial<MapilloSettings>) => void
	open: boolean
	onToggle: (open: boolean) => void
}

export function SettingsPanel({ settings, onSettingsChange, open, onToggle }: SettingsPanelProps) {
	const { t } = useTranslation()
	function handleOverpassChange(server: OverpassServer) {
		onSettingsChange({ overpassServer: server })
	}

	if (!open) {
		return (
			<button
				className="mapillo-ctrl mapillo-settings-toggle"
				onClick={() => onToggle(true)}
				title={t('Settings')}
			>
				<IcSettings />
			</button>
		)
	}

	return (
		<div className="mapillo-settings-panel">
			<div className="mapillo-settings-header">
				<span>{t('Settings')}</span>
				<button onClick={() => onToggle(false)} title={t('Close')}>
					<IcClose />
				</button>
			</div>

			<div className="mapillo-settings-section">
				<div className="mapillo-settings-label">{t('Overpass server')}</div>
				{(
					Object.entries(OVERPASS_SERVERS) as [
						OverpassServer,
						{ label: string; url: string }
					][]
				).map(([id, server]) => (
					<label key={id} className="mapillo-settings-radio">
						<input
							type="radio"
							name="overpass-server"
							checked={settings.overpassServer === id}
							onChange={() => handleOverpassChange(id)}
						/>
						<span>{t(server.label)}</span>
					</label>
				))}
			</div>

			<div className="mapillo-settings-section">
				<div className="mapillo-settings-label">{t('Privacy consents')}</div>
				<label className="c-settings-field">
					<span>{t('Nominatim (search)')}</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={!!settings.nominatimConsent}
						onChange={(e) => onSettingsChange({ nominatimConsent: e.target.checked })}
					/>
				</label>
				<label className="c-settings-field">
					<span>{t('Overpass (POI)')}</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={!!settings.overpassConsent}
						onChange={(e) => onSettingsChange({ overpassConsent: e.target.checked })}
					/>
				</label>
			</div>
		</div>
	)
}

// vim: ts=4
