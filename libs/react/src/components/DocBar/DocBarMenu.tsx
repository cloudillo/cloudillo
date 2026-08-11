// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuEllipsisVertical as IcMenu } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Dropdown, type DropdownProps } from '../Dropdown/index.js'
import { mergeClasses } from '../utils.js'

export interface DocBarMenuProps extends Omit<DropdownProps, 'trigger'> {
	/** Accessible label and tooltip for the trigger. Defaults to "Actions". */
	label?: string
	/** Replace the default dots glyph, keeping the button chrome. */
	icon?: React.ReactNode
	/** Replace the whole trigger. */
	trigger?: React.ReactNode
}

/**
 * The DocBar's overflow menu.
 *
 * A thin preset over {@link Dropdown} — dots trigger, bottom-end placement —
 * so all eight doc apps share one affordance instead of each hand-rolling an
 * anchored `c-menu`. Fill it with `MenuItem` / `MenuDivider` / `MenuHeader`.
 */
export function DocBarMenu({
	className,
	label,
	icon,
	trigger,
	placement = 'bottom-end',
	elevation = 'high',
	menuClassName,
	triggerClassName,
	triggerProps,
	children,
	...props
}: DocBarMenuProps) {
	const { t } = useLibTranslation()
	const menuLabel = label ?? t('Actions')

	return (
		<Dropdown
			className={mergeClasses('c-docbar-menu', className)}
			placement={placement}
			elevation={elevation}
			// The content is `MenuItem`s, so the popper has to be the menu they
			// belong to — and that is also what makes the item count announced.
			asMenu
			menuLabel={menuLabel}
			// `.c-popper` brings the surface but no padding or width floor, and
			// `.c-menu` cannot be added on top of it — that would re-apply
			// `position: fixed` over Popper's own positioning.
			menuClassName={mergeClasses('c-docbar-menu-popper', menuClassName)}
			triggerClassName={mergeClasses('c-button link icon', triggerClassName)}
			triggerProps={{ title: menuLabel, 'aria-label': menuLabel, ...triggerProps }}
			trigger={trigger ?? icon ?? <IcMenu />}
			{...props}
		>
			{children}
		</Dropdown>
	)
}

// vim: ts=4
