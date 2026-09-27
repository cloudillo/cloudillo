// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Field, Input, Panel, TextArea, Toggle, useAuth, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../settings/settings.js'

export function ProviderSettings() {
	const { t } = useTranslation()
	const [_auth] = useAuth()
	const { settings, onSettingChange } = useSettings('idp')

	if (!settings) return null

	const renewalIntervalDays = (settings['idp.renewal_interval'] as number) || 365
	const renewalIntervalYears = Math.round((renewalIntervalDays / 365) * 10) / 10

	return (
		<VBox gap={3}>
			<Panel title={t('Identity Provider Configuration')}>
				<VBox gap={3}>
					<Toggle
						color="primary"
						name="idp.enabled"
						checked={!!settings['idp.enabled']}
						onChange={onSettingChange}
						label={t('Enable Identity Provider functionality')}
						description={t(
							'Allow this tenant to act as an identity provider for other users'
						)}
					/>

					<Field
						label={t('Renewal interval (days)')}
						orientation="horizontal"
						hint={`${t('How long identity credentials are valid')} (${renewalIntervalYears} ${t('years')})`}
					>
						<Input
							className="w-sm"
							name="idp.renewal_interval"
							type="number"
							min="1"
							max="18250"
							value={String(renewalIntervalDays)}
							onChange={onSettingChange}
						/>
					</Field>
				</VBox>
			</Panel>

			<Panel
				title={t('Provider Public Info')}
				description={t(
					'This information is shown to users during registration when they choose an identity provider.'
				)}
			>
				<VBox gap={3}>
					<Field
						label={t('Provider Name')}
						hint={t('Display name shown to users (defaults to domain if empty)')}
					>
						<Input
							className="w-lg"
							name="idp.name"
							type="text"
							placeholder={t('e.g., Cloudillo')}
							value={String(settings['idp.name'] || '')}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('Provider Info')}
						hint={t('Short description with pricing, terms, or other important info')}
					>
						<TextArea
							name="idp.info"
							rows={3}
							placeholder={t(
								'e.g., Free during early access. ~€3/year after launch.'
							)}
							value={String(settings['idp.info'] || '')}
							onChange={onSettingChange}
						/>
					</Field>

					<Field
						label={t('More Info URL')}
						hint={t('Optional link for more details about the provider')}
					>
						<Input
							name="idp.url"
							type="url"
							placeholder={t('e.g., https://cloudillo.net/about')}
							value={String(settings['idp.url'] || '')}
							onChange={onSettingChange}
						/>
					</Field>
				</VBox>
			</Panel>
		</VBox>
	)
}

// vim: ts=4
