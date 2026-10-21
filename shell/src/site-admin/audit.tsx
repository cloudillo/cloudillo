// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { downloadBlob, isSessionExpiredError } from '@cloudillo/core'
import { Button, Field, Input, Panel, useApi, useToast, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	AuditCategorySwitches,
	AuditFilters,
	AuditLogView,
	defaultAuditFilter,
	toQuery,
	useAuditLog
} from '../audit/audit-log.js'
import { SettingsDenied, useSettings } from '../settings/settings.js'

export function AuditSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { settings, setSettings, onSettingChange, denied } = useSettings(['audit'], {
		level: 'global'
	})

	if (denied) return <SettingsDenied />
	if (!settings) return null

	const raw = (settings as Record<string, unknown>)['audit.categories']
	const categories = Array.isArray(raw) ? (raw as string[]) : ['sharing']

	async function saveCategories(next: string[]) {
		if (!api) return
		await api.settings.update('audit.categories', { value: next }, { level: 'global' })
		setSettings((s) => s && { ...s, 'audit.categories': next as unknown as string })
	}

	return (
		<Panel
			title={t('Logged categories')}
			description={t('Applies to every tenant; tenants can enable more for themselves.')}
		>
			<AuditCategorySwitches enabled={categories} locked={[]} onSave={saveCategories} />
			<Field
				className="mt-3"
				label={t('Retention (days)')}
				orientation="horizontal"
				hint={t('Audit events older than this are deleted.')}
			>
				<Input
					className="w-xs"
					name="audit.retention_days"
					type="number"
					min="1"
					value={String(settings['audit.retention_days'] ?? 365)}
					onChange={onSettingChange}
				/>
			</Field>
		</Panel>
	)
}

export function AuditLog() {
	const { t } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const [query, setQuery] = React.useState(() => toQuery(defaultAuditFilter()))
	const log = useAuditLog(api?.admin.listAudit, query)
	const [exporting, setExporting] = React.useState(false)

	async function exportCsv() {
		if (!api) return
		setExporting(true)
		try {
			downloadBlob(await api.admin.exportAuditCsv(query), 'audit.csv')
		} catch (err) {
			if (isSessionExpiredError(err)) return // global toast + /login redirect already shown
			toastError(err instanceof Error ? err.message : t('Export failed'))
		} finally {
			setExporting(false)
		}
	}

	return (
		<Panel
			title={t('Audit log')}
			actions={
				<Button size="sm" onClick={exportCsv} disabled={exporting}>
					{t('Export CSV')}
				</Button>
			}
		>
			<VBox gap={3}>
				<AuditFilters admin onApply={setQuery} />
				<AuditLogView log={log} showTenant label={t('Audit log')} />
			</VBox>
		</Panel>
	)
}

// vim: ts=4
