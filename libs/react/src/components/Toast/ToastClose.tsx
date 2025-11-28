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
import { mergeClasses, createComponent } from '../utils.js'
import { useToastContext } from './ToastContext.js'

export interface ToastCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children?: React.ReactNode
}

export const ToastClose = createComponent<HTMLButtonElement, ToastCloseProps>(
	'ToastClose',
	({ className, onClick, children, ...props }, ref) => {
		const context = useToastContext()

		function handleClick(evt: React.MouseEvent<HTMLButtonElement>) {
			if (context.dismiss) {
				context.dismiss()
			}
			onClick?.(evt)
		}

		return (
			<button
				ref={ref}
				type="button"
				className={mergeClasses('c-toast-close', className)}
				onClick={handleClick}
				aria-label="Close"
				{...props}
			>
				{children || <IcClose size="1em" />}
			</button>
		)
	}
)

// vim: ts=4
