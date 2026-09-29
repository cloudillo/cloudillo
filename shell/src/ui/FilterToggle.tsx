// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFilter as IcFilter } from 'react-icons/lu'

/** Mobile (<md) drawer toggle for a page's `Fcd.Filter`, placed in `PageHeader actions`. */
export function FilterToggle({ onClick, label }: { onClick: () => void; label?: string }) {
	const { t } = useTranslation()
	return (
		<Button
			className="md-hide lg-hide"
			variant="ghost"
			icon={<IcFilter />}
			aria-label={label ?? t('Filter')}
			onClick={onClick}
		/>
	)
}

// vim: ts=4
