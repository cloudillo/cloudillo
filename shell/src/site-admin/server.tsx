// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Panel, Toggle } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../settings/settings.js'

export function ServerSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings(['server'])

	if (!settings) return null

	return (
		<Panel title={t('Server')}>
			<Toggle
				color="primary"
				name="server.registration_enabled"
				checked={!!settings['server.registration_enabled']}
				onChange={onSettingChange}
				label={t('Allow new user registrations')}
				description={t('Controls whether new users can register on this instance')}
			/>
		</Panel>
	)
}

// vim: ts=4
