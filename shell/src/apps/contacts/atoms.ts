// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { atom } from 'jotai'

import type { AddressBookSelection, SelectedContactRef } from './types.js'

export const selectedAddressBookAtom = atom<AddressBookSelection>('all')
export const searchQueryAtom = atom<string>('')
export const selectedContactRefAtom = atom<SelectedContactRef | null>(null)

// vim: ts=4
