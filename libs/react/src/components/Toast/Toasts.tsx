// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import {
	LuCircleX as IcToastError,
	LuInfo as IcToastInfo,
	LuCircleCheck as IcToastSuccess,
	LuTriangleAlert as IcToastWarning
} from 'react-icons/lu'

import type { Position } from '../types.js'
import { Toast } from './Toast.js'
import { ToastClose } from './ToastClose.js'
import { ToastContainer } from './ToastContainer.js'
import { ToastContent } from './ToastContent.js'
import { ToastIcon } from './ToastIcon.js'
import { ToastMessage } from './ToastMessage.js'
import { ToastProgress } from './ToastProgress.js'
import { ToastTitle } from './ToastTitle.js'
import { useToast, useToasts } from './useToast.js'

export interface ToastsProps {
	position?: Position
}

/**
 * The renderer for `useToast()`.
 *
 * `useToast()` only pushes onto a module-level atom — without this mounted
 * somewhere in the tree nothing is ever drawn, so every app that can raise a
 * toast (any app with a DocBar rename) has to mount it.
 */
export function Toasts({ position = 'bottom-right' }: ToastsProps) {
	const toasts = useToasts()
	const { dismiss } = useToast()
	return (
		<ToastContainer position={position}>
			{toasts.map((t) => (
				<Toast
					key={t.id}
					toast={t}
					variant={t.variant}
					onDismiss={() => dismiss(t.id)}
					withProgress
				>
					<ToastIcon>
						{t.variant === 'success' && <IcToastSuccess />}
						{t.variant === 'error' && <IcToastError />}
						{t.variant === 'warning' && <IcToastWarning />}
						{(!t.variant || t.variant === 'info') && <IcToastInfo />}
					</ToastIcon>
					<ToastContent>
						{t.title && <ToastTitle>{t.title}</ToastTitle>}
						{t.message && <ToastMessage>{t.message}</ToastMessage>}
					</ToastContent>
					<ToastClose />
					<ToastProgress duration={t.duration} />
				</Toast>
			))}
		</ToastContainer>
	)
}

// vim: ts=4
