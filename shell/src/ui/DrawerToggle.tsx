// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFilter as IcFilter, LuPanelLeft as IcPanel } from 'react-icons/lu'

/**
 * Mobile (<md) drawer toggle for a page's `Fcd.Filter`, placed in `PageHeader actions`.
 * Set `nav` when the drawer holds navigation (views, rooms, sections); the funnel icon is
 * reserved for filter-only drawers.
 */
export function DrawerToggle({
	onClick,
	label,
	nav
}: {
	onClick: () => void
	label?: string
	nav?: boolean
}) {
	const { t } = useTranslation()
	return (
		<Button
			className="md-hide lg-hide"
			variant="ghost"
			icon={nav ? <IcPanel /> : <IcFilter />}
			aria-label={label ?? (nav ? t('Navigation') : t('Filter'))}
			onClick={onClick}
		/>
	)
}

// vim: ts=4
