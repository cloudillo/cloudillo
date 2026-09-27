// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Divider } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface ReadDividerProps {
	label?: string
}

// "New since your last visit" marker rendered between the unread and
// already-seen posts in the Feed tab.
export function ReadDivider({ label }: ReadDividerProps) {
	const { t } = useTranslation()
	return <Divider label={label ?? t('New since your last visit')} className="py-2" />
}

// vim: ts=4
