// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Field, NativeSelect, Panel } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { SettingsDenied, useSettings } from '../settings/settings.js'

export function ServerSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange, denied } = useSettings(['auth'], { level: 'global' })

	if (denied) return <SettingsDenied />
	if (!settings) return null

	return (
		<Panel title={t('Server')}>
			<Field
				label={t('Two-factor authentication')}
				orientation="horizontal"
				hint={t(
					'Passkey and QR sign-ins never ask for a code. When required, users without an authenticator app must set one up at their next password sign-in.'
				)}
			>
				<NativeSelect
					name="auth.mfa"
					value={(settings['auth.mfa'] as string | undefined) ?? 'off'}
					onChange={onSettingChange}
				>
					<option value="off">{t('Off')}</option>
					<option value="optional">{t('Optional')}</option>
					<option value="required">{t('Required')}</option>
				</NativeSelect>
			</Field>
		</Panel>
	)
}

// vim: ts=4
