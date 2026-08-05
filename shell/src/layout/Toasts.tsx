// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Toast,
	ToastClose,
	ToastContainer,
	ToastContent,
	ToastIcon,
	ToastMessage,
	ToastProgress,
	ToastTitle,
	useToast,
	useToasts
} from '@cloudillo/react'
import * as React from 'react'
import {
	LuCircleX as IcToastError,
	LuInfo as IcToastInfo,
	LuCircleCheck as IcToastSuccess,
	LuTriangleAlert as IcToastWarning
} from 'react-icons/lu'

export function Toasts() {
	const toasts = useToasts()
	const { dismiss } = useToast()
	return (
		<ToastContainer position="bottom-right">
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
