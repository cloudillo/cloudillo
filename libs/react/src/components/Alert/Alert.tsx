// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import {
	LuCircleCheck as IcSuccess,
	LuCircleX as IcError,
	LuInfo as IcInfo,
	LuTriangleAlert as IcWarning,
	LuX as IcClose
} from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { createComponent, mergeClasses } from '../utils.js'

export type AlertColor = 'info' | 'success' | 'warning' | 'error' | 'neutral'
export type AlertVariant = 'soft' | 'filled' | 'outline'

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'color'> {
	color?: AlertColor
	variant?: AlertVariant
	/** Overrides the colour's icon; `false` hides it */
	icon?: React.ReactNode | false
	title?: React.ReactNode
	/** At most one primary action */
	actions?: React.ReactNode
	compact?: boolean
	/** Light-on-dark colours for use over media / dark overlays */
	inverse?: boolean
	onDismiss?: () => void
}

const ICONS: Record<AlertColor, React.ComponentType> = {
	info: IcInfo,
	neutral: IcInfo,
	success: IcSuccess,
	warning: IcWarning,
	error: IcError
}

export const Alert = createComponent<HTMLDivElement, AlertProps>(
	'Alert',
	(
		{
			className,
			color = 'info',
			variant = 'soft',
			icon,
			title,
			actions,
			compact,
			inverse,
			onDismiss,
			children,
			...props
		},
		ref
	) => {
		const { t } = useLibTranslation()
		const Icon = ICONS[color]

		return (
			<div
				ref={ref}
				role={color === 'error' || color === 'warning' ? 'alert' : 'status'}
				className={mergeClasses(
					'c-alert',
					color,
					variant !== 'soft' && variant,
					compact && 'compact',
					inverse && 'inverse',
					className
				)}
				{...props}
			>
				{icon !== false && (
					<span className="c-alert-icon" aria-hidden="true">
						{icon ?? <Icon />}
					</span>
				)}
				<div className="c-alert-content">
					{title && <div className="c-alert-title">{title}</div>}
					{children && <div className="c-alert-message">{children}</div>}
					{actions && <div className="c-alert-actions">{actions}</div>}
				</div>
				{onDismiss && (
					<button
						type="button"
						className="c-alert-close"
						aria-label={t('Dismiss')}
						onClick={onDismiss}
					>
						<IcClose />
					</button>
				)}
			</div>
		)
	}
)

// vim: ts=4
