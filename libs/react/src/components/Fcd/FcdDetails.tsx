// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { IcClose } from '../../icons.js'
import { Button } from '../Button/Button.js'
import { mergeClasses } from '../utils.js'

export interface FcdDetailsProps {
	className?: string
	isVisible?: boolean
	hide?: () => void
	/**
	 * Optional header row rendered at the top of the panel. Use this to put
	 * a title and action buttons (e.g. "+") that would otherwise collide with
	 * the absolute-positioned close button. The close button is rendered
	 * on top of this row at the right; the row reserves the right padding
	 * for it while the button is visible (phone sheet and overlay — docked
	 * details has no close button, the page's own toggle closes it).
	 */
	header?: React.ReactNode
	children?: React.ReactNode
}

export function FcdDetails({ isVisible, className, hide, header, children }: FcdDetailsProps) {
	return (
		<div
			className={mergeClasses(
				'c-fcd-details c-vbox sm-hide-dyn md-hide-dyn hide-right h-100',
				className,
				isVisible && 'show'
			)}
			onClick={hide}
		>
			<Button
				variant="link"
				className="c-fcd-details-close pos-absolute top-0 right-0 m-1 p-2 z-4"
				onClick={hide}
			>
				<IcClose />
			</Button>
			<div
				className="c-fcd-details-body w-100 fill c-vbox h-min-0"
				onClick={(evt) => evt.stopPropagation()}
			>
				{header && (
					<div className="c-fcd-details-header c-hbox align-items-center g-2">
						{header}
					</div>
				)}
				<div className="c-fcd-details-scroll c-vbox fill overflow-y-auto">{children}</div>
			</div>
		</div>
	)
}

// vim: ts=4
