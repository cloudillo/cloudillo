// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Panel, useApi, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	AuditFilters,
	AuditLogView,
	defaultAuditFilter,
	toQuery,
	useAuditLog
} from '../audit/audit-log.js'

/** The owner's own audit rows */
export function AuditLogSettings() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [query, setQuery] = React.useState(() => toQuery(defaultAuditFilter()))
	const log = useAuditLog(api?.auth.listAudit, query)

	return (
		<Panel
			title={t('Audit log')}
			description={t(
				'Sign-ins, administrative actions and other security events on your account.'
			)}
		>
			<VBox gap={3}>
				<AuditFilters onApply={setQuery} />
				<AuditLogView log={log} label={t('Audit log')} />
			</VBox>
		</Panel>
	)
}

// vim: ts=4
