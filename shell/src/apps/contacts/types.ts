// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ContactListItem, ContactOutput, AddressBookOutput } from '@cloudillo/core'

export type AddressBookSelection = number | 'all'

export interface SelectedContactRef {
	abId: number
	uid: string
}

export type { ContactListItem, ContactOutput, AddressBookOutput }

// vim: ts=4
