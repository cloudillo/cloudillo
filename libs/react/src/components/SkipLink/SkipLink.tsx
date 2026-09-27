// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { mergeClasses } from '../utils.js'

export interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
	/** Fragment of the main landmark */
	href?: string
}

/** Visually hidden until focused; render it as the first focusable element of the page. */
export function SkipLink({ href = '#main', className, children, ...props }: SkipLinkProps) {
	const { t } = useLibTranslation()
	return (
		<a href={href} className={mergeClasses('c-skip-link', className)} {...props}>
			{children ?? t('Skip to main content')}
		</a>
	)
}

// vim: ts=4
