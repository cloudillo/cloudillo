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

export function EmailSettings() {
	const { t } = useTranslation()
	const { settings, onSettingChange } = useSettings('email')
	const [showPassword, setShowPassword] = React.useState(false)

	if (!settings) return null

	const emailEnabled = settings['email.enabled']

	return <>
		<div className="c-panel">
			<h4>{t('Email Configuration')}</h4>

			<label className="c-hbox pb-2">
				<span className="flex-fill">{t('Enable email sending')}</span>
				<input
					className="c-toggle primary"
					name="email.enabled"
					type="checkbox"
					checked={!!emailEnabled}
					onChange={onSettingChange}
				/>
			</label>
			<p className="c-hint mb-4">{t('Disable for testing. When disabled, email features will be silently skipped.')}</p>
		</div>

		{emailEnabled && <>
			<div className="c-panel">
				<h4>{t('SMTP Server Configuration')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('SMTP Host')}</span>
					<input
						className="c-input"
						name="email.smtp.host"
						type="text"
						placeholder="smtp.gmail.com"
						value={settings['email.smtp.host'] as string || ''}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('SMTP server hostname. Example: smtp.gmail.com')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('SMTP Port')}</span>
					<input
						className="c-input"
						name="email.smtp.port"
						type="number"
						min="1"
						max="65535"
						value={String(settings['email.smtp.port'] || 587)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Typically 25 (SMTP), 465 (SMTPS), or 587 (Submission with STARTTLS)')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('TLS Mode')}</span>
					<select
						className="c-select"
						name="email.smtp.tls_mode"
						value={settings['email.smtp.tls_mode'] as string || 'starttls'}
						onChange={onSettingChange}
					>
						<option value="none">{t('None')}</option>
						<option value="starttls">{t('STARTTLS (recommended)')}</option>
						<option value="tls">{t('TLS/SSL')}</option>
					</select>
				</label>
				<p className="c-hint mb-4">{t('STARTTLS on port 587, TLS/SSL on port 465')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Connection Timeout (seconds)')}</span>
					<input
						className="c-input"
						name="email.smtp.timeout_seconds"
						type="number"
						min="1"
						max="300"
						value={String(settings['email.smtp.timeout_seconds'] || 30)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('How long to wait before abandoning connection')}</p>
			</div>

			<div className="c-panel">
				<h4>{t('SMTP Authentication')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Username')}</span>
					<input
						className="c-input"
						name="email.smtp.username"
						type="text"
						placeholder="your@email.com"
						value={settings['email.smtp.username'] as string || ''}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('SMTP authentication username (optional)')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Password')}</span>
					<div className="c-hbox">
						<input
							className="c-input flex-fill"
							name="email.smtp.password"
							type={showPassword ? 'text' : 'password'}
							value={settings['email.smtp.password'] as string || ''}
							onChange={onSettingChange}
						/>
						<button
							className="c-btn"
							type="button"
							onClick={() => setShowPassword(!showPassword)}
						>
							{showPassword ? t('Hide') : t('Show')}
						</button>
					</div>
				</label>
				<p className="c-hint mb-4">{t('SMTP authentication password (optional)')}</p>
			</div>

			<div className="c-panel">
				<h4>{t('Sender Configuration')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('From Address')}</span>
					<input
						className="c-input"
						name="email.from.address"
						type="email"
						placeholder="noreply@example.com"
						value={settings['email.from.address'] as string || ''}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Email address that will appear as the sender')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('From Name')}</span>
					<input
						className="c-input"
						name="email.from.name"
						type="text"
						value={settings['email.from.name'] as string || 'Cloudillo'}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Display name for the sender')}</p>
			</div>

			<div className="c-panel">
				<h4>{t('Advanced Options')}</h4>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Email Template Directory')}</span>
					<input
						className="c-input"
						name="email.template_dir"
						type="text"
						value={settings['email.template_dir'] as string || './templates/email'}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Path to email templates directory')}</p>

				<label className="c-hbox pb-2">
					<span className="flex-fill">{t('Retry Attempts')}</span>
					<input
						className="c-input"
						name="email.retry_attempts"
						type="number"
						min="0"
						max="10"
						value={String(settings['email.retry_attempts'] || 3)}
						onChange={onSettingChange}
					/>
				</label>
				<p className="c-hint mb-4">{t('Number of times to retry sending failed emails')}</p>
			</div>
		</>}
	</>
}

// vim: ts=4
