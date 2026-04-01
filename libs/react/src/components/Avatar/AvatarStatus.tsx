// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import type { AvatarStatus as AvatarStatusType } from '../types.js'

export interface AvatarStatusProps extends React.HTMLAttributes<HTMLSpanElement> {
	status?: AvatarStatusType
}

export const AvatarStatus = createComponent<HTMLSpanElement, AvatarStatusProps>(
	'AvatarStatus',
	({ className, status = 'offline', ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={mergeClasses('c-avatar-status', status, className)}
				{...props}
			/>
		)
	}
)

// vim: ts=4
