// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AddressBookOutput, ContactListItem, ContactOutput } from '@cloudillo/core'

export type AddressBookSelection = number | 'all'

export interface SelectedContactRef {
	abId: number
	uid: string
}

export type { AddressBookOutput, ContactListItem, ContactOutput }

// vim: ts=4
