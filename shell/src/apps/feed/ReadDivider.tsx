// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface ReadDividerProps {
	label?: string
}

// "New since your last visit" marker rendered between the unread and
// already-seen posts in the Feed tab.
export function ReadDivider({ label }: ReadDividerProps) {
	const { t } = useTranslation()
	return (
		<div className="c-hbox align-items-center g-2 py-2 text-muted small">
			<hr className="flex-fill" />
			<span>{label ?? t('New since your last visit')}</span>
			<hr className="flex-fill" />
		</div>
	)
}

// vim: ts=4
