// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'
import type { AddressBookSelection, SelectedContactRef } from './types.js'

export const selectedAddressBookAtom = atom<AddressBookSelection>('all')
export const searchQueryAtom = atom<string>('')
export const selectedContactRefAtom = atom<SelectedContactRef | null>(null)

// vim: ts=4
