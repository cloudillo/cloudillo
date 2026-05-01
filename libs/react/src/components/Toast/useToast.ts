// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { atom, useAtomValue, useSetAtom } from 'jotai'
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

// Active auto-dismiss timers, keyed by toast id. Module-level because the
// toasts atom is also module-level — any consumer that calls dismiss() must be
// able to clear a timer started by any other consumer.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearToastTimer(id: string) {
	const timer = toastTimers.get(id)
	if (timer !== undefined) {
		clearTimeout(timer)
		toastTimers.delete(id)
	}
}

/**
 * Action-only toast hook. Returns a stable object identity across renders, so
 * it is safe to list in `useEffect` / `useCallback` dep arrays. Does NOT
 * subscribe to the toasts list — use `useToasts()` to render the list.
 */
export function useToast(): UseToastReturn {
	const setToasts = useSetAtom(toastsAtom)

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
				const timer = setTimeout(() => {
					toastTimers.delete(id)
					setToasts((prev) => prev.filter((t) => t.id !== id))
				}, toastData.duration)
				toastTimers.set(id, timer)
			}

			return id
		},
		[setToasts]
	)

	const dismiss = React.useCallback(
		(id: string) => {
			clearToastTimer(id)
			setToasts((prev) => prev.filter((t) => t.id !== id))
		},
		[setToasts]
	)

	const dismissAll = React.useCallback(() => {
		for (const timer of toastTimers.values()) clearTimeout(timer)
		toastTimers.clear()
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

	return React.useMemo(
		() => ({
			toast,
			dismiss,
			dismissAll,
			success,
			error,
			warning,
			info
		}),
		[toast, dismiss, dismissAll, success, error, warning, info]
	)
}

/**
 * Subscribe to the live toasts array. Use this in `ToastContainer`-style
 * components that render the list. Do NOT use it for action-only consumers —
 * use `useToast()` instead so re-renders don't cascade through the app.
 */
export function useToasts(): ToastData[] {
	return useAtomValue(toastsAtom)
}

// vim: ts=4
