// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AddressBookOutput, ContactListItem, ContactOutput } from '@cloudillo/core'

/** An address-book id, or 'all' */
export type AddressBookSelection = string

export interface SelectedContactRef {
	abId: string
	uid: string
}

export type { AddressBookOutput, ContactListItem, ContactOutput }

// vim: ts=4
