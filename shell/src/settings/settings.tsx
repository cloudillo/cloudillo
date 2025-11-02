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

import { useApi } from '@cloudillo/react'

export function useSettings(prefix: string | string[]) {
	const { api, setIdTag } = useApi()
	const [settings, setSettings] = React.useState<Record<string, string | number | boolean> | undefined>()
	const prefixStr = React.useMemo(() => Array.isArray(prefix) ? prefix.join(',') : prefix, [prefix])

	React.useEffect(function loadSettings() {
		if (!api) return
		(async function () {
			const res = await api.settings.list({ prefix: prefixStr })
			// Convert array of SettingResponse to flat object mapping key -> value
			const settingsMap = Object.fromEntries(
				res.map((setting: any) => [setting.key, setting.value])
			)
			setSettings(settingsMap)
		})()
	}, [api, prefixStr])

	async function onSettingChange(evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
		if (!settings || !api) return

		let value = evt.target.type == 'checkbox' ? evt.target.checked : evt.target.value
		await api.settings.update(evt.target.name, { value })
		setSettings(settings => ({ ...settings, [evt.target.name]: value }))
	}

	return { settings, setSettings, onSettingChange }
}


// vim: ts=4
