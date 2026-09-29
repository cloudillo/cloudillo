// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { List, Panel } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { SettingsDenied, SwitchRow, useSettings } from '../settings/settings.js'

export function ServerSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange, denied } = useSettings(['server'])

	if (denied) return <SettingsDenied />
	if (!settings) return null

	return (
		<Panel title={t('Server')}>
			<List variant="divided">
				<SwitchRow
					name="server.registration_enabled"
					checked={!!settings['server.registration_enabled']}
					onChange={onSettingChange}
					label={t('Allow new user registrations')}
					description={t('Controls whether new users can register on this instance')}
				/>
			</List>
		</Panel>
	)
}

// vim: ts=4
