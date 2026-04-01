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
	children?: React.ReactNode
}

export function FcdDetails({ isVisible, className, hide, children }: FcdDetailsProps) {
	return (
		<div
			className={mergeClasses(
				'c-vbox sm-hide-dyn md-hide-dyn hide-right col-lg-3 h-100',
				className,
				isVisible && 'show'
			)}
			onClick={hide}
		>
			<div className="pos-absolute top-0 right-0 bottom-0 left-0 bg-shadow lg-hide" />
			<Button link className="pos-absolute top-0 right-0 m-1 p-2 z-4 lg-hide" onClick={hide}>
				<IcClose />
			</Button>
			<div
				className="z-1 w-100 fill c-vbox h-min-0 overflow-y-auto"
				onClick={(evt) => evt.stopPropagation()}
			>
				{children}
			</div>
		</div>
	)
}

// vim: ts=4
