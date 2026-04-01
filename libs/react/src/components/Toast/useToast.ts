// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { atom, useAtom } from 'jotai'
import type { ToastVariant } from '../types.js'

export interface ToastData {
	id: string
	variant?: ToastVariant
	title?: string
	message?: string
	duration?: number
	dismissible?: boolean
	actions?: React.ReactNode
	createdAt: number
}

export interface ToastOptions {
	variant?: ToastVariant
	title?: string
	message?: string
	duration?: number
	dismissible?: boolean
	actions?: React.ReactNode
}

export interface UseToastReturn {
	toasts: ToastData[]
	toast: (options: ToastOptions) => string
	dismiss: (id: string) => void
	dismissAll: () => void
	success: (message: string, options?: Omit<ToastOptions, 'variant'>) => string
	error: (message: string, options?: Omit<ToastOptions, 'variant'>) => string
	warning: (message: string, options?: Omit<ToastOptions, 'variant'>) => string
	info: (message: string, options?: Omit<ToastOptions, 'variant'>) => string
}

// Generate unique IDs
let toastCounter = 0
function generateToastId(): string {
	return `toast-${++toastCounter}-${Date.now()}`
}

// Global toast state
const toastsAtom = atom<ToastData[]>([])

export function useToast(): UseToastReturn {
	const [toasts, setToasts] = useAtom(toastsAtom)

	const toast = React.useCallback(
		(options: ToastOptions): string => {
			const id = generateToastId()
			const toastData: ToastData = {
				id,
				variant: options.variant,
				title: options.title,
				message: options.message,
				duration: options.duration ?? 5000,
				dismissible: options.dismissible ?? true,
				actions: options.actions,
				createdAt: Date.now()
			}

			setToasts((prev) => [...prev, toastData])

			// Auto-dismiss if duration is set
			if (toastData.duration && toastData.duration > 0) {
				setTimeout(() => {
					setToasts((prev) => prev.filter((t) => t.id !== id))
				}, toastData.duration)
			}

			return id
		},
		[setToasts]
	)

	const dismiss = React.useCallback(
		(id: string) => {
			setToasts((prev) => prev.filter((t) => t.id !== id))
		},
		[setToasts]
	)

	const dismissAll = React.useCallback(() => {
		setToasts([])
	}, [setToasts])

	const success = React.useCallback(
		(message: string, options?: Omit<ToastOptions, 'variant'>) => {
			return toast({ ...options, message, variant: 'success' })
		},
		[toast]
	)

	const error = React.useCallback(
		(message: string, options?: Omit<ToastOptions, 'variant'>) => {
			return toast({ ...options, message, variant: 'error' })
		},
		[toast]
	)

	const warning = React.useCallback(
		(message: string, options?: Omit<ToastOptions, 'variant'>) => {
			return toast({ ...options, message, variant: 'warning' })
		},
		[toast]
	)

	const info = React.useCallback(
		(message: string, options?: Omit<ToastOptions, 'variant'>) => {
			return toast({ ...options, message, variant: 'info' })
		},
		[toast]
	)

	return {
		toasts,
		toast,
		dismiss,
		dismissAll,
		success,
		error,
		warning,
		info
	}
}

// vim: ts=4
