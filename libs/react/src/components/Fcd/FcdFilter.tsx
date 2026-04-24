// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'
import { mergeClasses } from '../utils.js'
import { Button } from '../Button/Button.js'

export interface FcdFilterProps {
	className?: string
	isVisible?: boolean
	hide?: () => void
	children?: React.ReactNode
}

export function FcdFilter({ className, isVisible, hide, children }: FcdFilterProps) {
	return (
		<div
			className={mergeClasses(
				'c-fcd-filter c-vbox sm-hide-dyn hide-left col-md-4 col-lg-3 h-100 overflow-y-auto',
				className,
				isVisible && 'show'
			)}
			onClick={hide}
		>
			<div className="pos-absolute top-0 right-0 bottom-0 left-0 bg-shadow md-hide lg-hide" />
			<Button
				link
				className="pos-absolute top-0 right-0 m-1 p-2 z-10 md-hide lg-hide"
				onClick={hide}
			>
				<IcClose />
			</Button>
			<div className="w-100 fill c-vbox h-min-0" onClick={(evt) => evt.stopPropagation()}>
				{children}
			</div>
		</div>
	)
}

// vim: ts=4
