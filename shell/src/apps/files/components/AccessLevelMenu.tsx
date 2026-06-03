// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Dropdown, mergeClasses } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown as IcChevron, LuTrash2 as IcTrash } from 'react-icons/lu'

export type AccessLevelUpper = 'READ' | 'COMMENT' | 'WRITE'
export type AccessLevelLower = 'read' | 'comment' | 'write'
export type AccessLevel = AccessLevelUpper | AccessLevelLower

const UPPER: Record<AccessLevelLower, AccessLevelUpper> = {
	read: 'READ',
	comment: 'COMMENT',
	write: 'WRITE'
}

function toUpper(level: AccessLevel): AccessLevelUpper {
	return Object.hasOwn(UPPER, level)
		? UPPER[level as AccessLevelLower]
		: (level as AccessLevelUpper)
}

export interface AccessLevelMenuProps<L extends AccessLevel = AccessLevel> {
	value: L
	onChange: (level: L) => void
	onRemove?: () => void
	disabledLevels?: AccessLevelUpper[]
	disabled?: boolean
	ariaLabel?: string
	className?: string
}

export function AccessLevelMenu<L extends AccessLevel>({
	value,
	onChange,
	onRemove,
	disabledLevels,
	disabled,
	ariaLabel,
	className
}: AccessLevelMenuProps<L>) {
	const { t } = useTranslation()
	const upper = toUpper(value)
	const isLower = value === 'read' || value === 'comment' || value === 'write'

	const label =
		upper === 'WRITE' ? t('Editor') : upper === 'COMMENT' ? t('Commenter') : t('Viewer')
	const variant = upper === 'WRITE' ? 'accent' : upper === 'COMMENT' ? 'primary' : 'secondary'

	function pick(next: AccessLevelUpper) {
		if (next === upper) return
		const out = (isLower ? next.toLowerCase() : next) as L
		onChange(out)
	}

	function renderItem(level: AccessLevelUpper, itemLabel: string) {
		if (disabledLevels?.includes(level)) return null
		return (
			<li>
				<Button
					kind="nav-item"
					className={level === upper ? 'active' : ''}
					onClick={() => pick(level)}
				>
					{itemLabel}
				</Button>
			</li>
		)
	}

	if (disabled) {
		return (
			<Button
				size="small"
				variant={variant}
				className={className}
				aria-label={ariaLabel}
				disabled
			>
				{label}
			</Button>
		)
	}

	return (
		<Dropdown
			triggerClassName={mergeClasses('c-button small', variant, className)}
			placement="bottom-end"
			triggerProps={{ 'aria-label': ariaLabel, 'aria-haspopup': 'menu' }}
			trigger={
				<>
					{label}
					<IcChevron />
				</>
			}
		>
			<ul className="c-nav vertical emph">
				{renderItem('READ', t('Viewer'))}
				{renderItem('COMMENT', t('Commenter'))}
				{renderItem('WRITE', t('Editor'))}
				{onRemove && (
					<>
						<li>
							<hr className="my-1" />
						</li>
						<li>
							<Button kind="nav-item" onClick={onRemove}>
								<IcTrash style={{ color: 'var(--col-error)' }} />
								{t('Remove access')}
							</Button>
						</li>
					</>
				)}
			</ul>
		</Dropdown>
	)
}

// vim: ts=4
