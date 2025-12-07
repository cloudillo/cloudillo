// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
				'c-vbox sm-hide-dyn md-hide-dyn hide-right col-lg-3 h-100 overflow-y-auto',
				className,
				isVisible && 'show'
			)}
			onClick={hide}
		>
			<div className="pos-absolute top-0 right-0 bottom-0 left-0 bg-shadow lg-hide" />
			<Button link className="pos-absolute top-0 right-0 m-1 p-2 z-4 lg-hide" onClick={hide}>
				<IcClose />
			</Button>
			<div className="z-1 w-100 h-min-100" onClick={(evt) => evt.stopPropagation()}>
				{children}
			</div>
		</div>
	)
}

// vim: ts=4
