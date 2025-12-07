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
import { atom, useAtom } from 'jotai'
import type { ToastVariant, Position } from '../types.js'

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
