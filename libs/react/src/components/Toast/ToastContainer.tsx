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
import { createPortal } from 'react-dom'
import { mergeClasses, createComponent } from '../utils.js'
import type { Position } from '../types.js'

export interface ToastContainerProps extends React.HTMLAttributes<HTMLDivElement> {
	position?: Position
	children?: React.ReactNode
}

export const ToastContainer = createComponent<HTMLDivElement, ToastContainerProps>(
	'ToastContainer',
	({ className, position = 'top-right', children, ...props }, ref) => {
		const content = (
			<div
				ref={ref}
				className={mergeClasses('c-toast-container', position, className)}
				{...props}
			>
				{children}
			</div>
		)

		// Portal to document body
		if (typeof document !== 'undefined') {
			return createPortal(content, document.body)
		}

		return content
	}
)

// vim: ts=4
