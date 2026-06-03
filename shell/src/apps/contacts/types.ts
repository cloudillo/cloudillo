// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AddressBookOutput, ContactListItem, ContactOutput } from '@cloudillo/core'

export type AddressBookSelection = number | 'all'

export interface SelectedContactRef {
	abId: number
	uid: string
}

export type { AddressBookOutput, ContactListItem, ContactOutput }

// vim: ts=4
