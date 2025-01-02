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

function setTheme(theme: string | number | boolean, colors: string | number | boolean) {
	//console.log('setTheme', theme, colors)

	switch (theme) {
	case 'glass':
		document.body.classList.remove('theme-opaque')
		document.body.classList.add('theme-glass')
		break
	case 'opaque':
		document.body.classList.remove('theme-glass')
		document.body.classList.add('theme-opaque')
		break
	default:
		document.body.classList.remove('theme-opaque')
		document.body.classList.add('theme-glass')
		break
	}

	switch (colors) {
	case 'dark':
		document.body.classList.remove('light')
		document.body.classList.add('dark')
		break
	case 'light':
		document.body.classList.remove('dark')
		document.body.classList.add('light')
		break
	default:
		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			document.body.classList.remove('light')
			document.body.classList.add('dark')
		} else {
			document.body.classList.remove('dark')
			document.body.classList.add('light')
		}
		break
	}
}

export function AppearanceSettings() {
	const { t } = useTranslation()
	const api = useApi()

	const { settings, onSettingChange } = useSettings('ui')

	function onThemeChange(evt: React.ChangeEvent<HTMLSelectElement>) {
		if (!settings) return

		onSettingChange(evt)
		//console.log('onThemeChange', evt.target.name, evt.target.value)
		if (evt.target.name == 'ui.theme') setTheme(evt.target.value, settings['ui.colors'])
		if (evt.target.name == 'ui.colors') setTheme(settings['ui.theme'], evt.target.value)
	}

	if (!settings) return null

	return <>
		<div className="c-panel">
			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Theme')}</span>
				<select className="c-select" name="ui.theme" value={settings['ui.theme'] as string} onChange={onThemeChange}>
					<option value="glass">{t('Glass')}</option>
					<option value="opaque">{t('Opaque')}</option>
				</select>
			</label>
			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Theme')}</span>
				<select className="c-select" name="ui.colors" value={settings['ui.colors'] as string} onChange={onThemeChange}>
					<option value="default">{t('Use browser settings')}</option>
					<option value="light">{t('Light')}</option>
					<option value="dark">{t('Dark')}</option>
				</select>
			</label>
		</div>
	</>
}

// vim: ts=4
