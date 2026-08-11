// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Toasts as LibToasts } from '@cloudillo/react'
import * as React from 'react'

/** The shell's toast renderer — the library one, pinned to the shell's corner. */
export function Toasts() {
	return <LibToasts position="bottom-right" />
}

// vim: ts=4
