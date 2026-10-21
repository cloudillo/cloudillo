// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import type { ToastData } from './useToast.js'

export interface ToastContextValue {
	toast?: ToastData
	dismiss?: () => void
}

export const ToastContext = React.createContext<ToastContextValue>({})

export function useToastContext() {
	return React.useContext(ToastContext)
}

// vim: ts=4
