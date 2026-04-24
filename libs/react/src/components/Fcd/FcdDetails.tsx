// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'
import { mergeClasses } from '../utils.js'
import { Button } from '../Button/Button.js'

export interface FcdDetailsProps {
	className?: string
	isVisible?: boolean
	hide?: () => void
	/**
	 * Optional header row rendered at the top of the panel. Use this to put
	 * a title and action buttons (e.g. "+") that would otherwise collide with
	 * the absolute-positioned close button. The close button is rendered
	 * on top of this row at the right; the row reserves the right padding
	 * for it automatically.
	 */
	header?: React.ReactNode
	children?: React.ReactNode
}

export function FcdDetails({ isVisible, className, hide, header, children }: FcdDetailsProps) {
	return (
		<div
			className={mergeClasses(
				'c-fcd-details c-vbox sm-hide-dyn md-hide-dyn hide-right col-lg-3 h-100',
				className,
				isVisible && 'show'
			)}
			onClick={hide}
		>
			<Button
				link
				className="c-fcd-details-close pos-absolute top-0 right-0 m-1 p-2 z-4 lg-hide"
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
