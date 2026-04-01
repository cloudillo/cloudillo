// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export type EmptyStateSize = 'sm' | 'md' | 'lg'

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
	icon?: React.ReactNode
	title?: React.ReactNode
	description?: React.ReactNode
	action?: React.ReactNode
	size?: EmptyStateSize
}

export const EmptyState = createComponent<HTMLDivElement, EmptyStateProps>(
	'EmptyState',
	({ className, icon, title, description, action, size = 'md', children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-empty-state', `c-empty-state--${size}`, className)}
				{...props}
			>
				{icon && <div className="c-empty-state-icon">{icon}</div>}
				{title && <h3 className="c-empty-state-title">{title}</h3>}
				{description && <p className="c-empty-state-description">{description}</p>}
				{action && <div className="c-empty-state-action">{action}</div>}
				{children}
			</div>
		)
	}
)

// vim: ts=4
