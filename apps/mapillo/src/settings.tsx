// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilard Hajba
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
import { LuSettings as IcSettings, LuX as IcClose } from 'react-icons/lu'

import type { MapilloSettings, OverpassServer } from './types.js'
import { OVERPASS_SERVERS } from './types.js'

interface SettingsPanelProps {
	settings: MapilloSettings
	onSettingsChange: (changes: Partial<MapilloSettings>) => void
	open: boolean
	onToggle: (open: boolean) => void
}

export function SettingsPanel({ settings, onSettingsChange, open, onToggle }: SettingsPanelProps) {
	function handleOverpassChange(server: OverpassServer) {
		onSettingsChange({ overpassServer: server })
	}

	if (!open) {
		return (
			<button
				className="mapillo-settings-toggle"
				onClick={() => onToggle(true)}
				title="Settings"
			>
				<IcSettings />
			</button>
		)
	}

	return (
		<div className="mapillo-settings-panel">
			<div className="mapillo-settings-header">
				<span>Settings</span>
				<button onClick={() => onToggle(false)} title="Close">
					<IcClose />
				</button>
			</div>

			<div className="mapillo-settings-section">
				<div className="mapillo-settings-label">Overpass server</div>
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
						<span>{server.label}</span>
					</label>
				))}
			</div>

			<div className="mapillo-settings-section">
				<div className="mapillo-settings-label">Privacy consents</div>
				<label className="c-settings-field">
					<span>Nominatim (search)</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={!!settings.nominatimConsent}
						onChange={(e) => onSettingsChange({ nominatimConsent: e.target.checked })}
					/>
				</label>
				<label className="c-settings-field">
					<span>Overpass (POI)</span>
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
