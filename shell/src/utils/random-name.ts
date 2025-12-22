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

/**
 * Random Guest Name Generator
 *
 * Generates 3-part names in the format: Adjective + Color + Animal
 * Example: "HappyBlueElephant", "SwiftGreenFox"
 */

const ADJECTIVES = [
	'Happy',
	'Brave',
	'Clever',
	'Swift',
	'Gentle',
	'Calm',
	'Keen',
	'Wise',
	'Bold',
	'Bright',
	'Quick',
	'Warm',
	'Kind',
	'Cool',
	'Fair',
	'Noble',
	'Eager',
	'Lucky',
	'Merry',
	'Proud',
	'Quiet',
	'Witty',
	'Smart',
	'Vivid'
]

const COLORS = [
	'Blue',
	'Green',
	'Red',
	'Gold',
	'Silver',
	'Amber',
	'Coral',
	'Jade',
	'Ruby',
	'Azure',
	'Violet',
	'Scarlet',
	'Ivory',
	'Crimson',
	'Copper',
	'Pearl',
	'Indigo',
	'Teal',
	'Olive',
	'Salmon',
	'Maroon',
	'Navy',
	'Mint',
	'Rose'
]

const ANIMALS = [
	'Elephant',
	'Tiger',
	'Eagle',
	'Dolphin',
	'Fox',
	'Owl',
	'Bear',
	'Wolf',
	'Hawk',
	'Lion',
	'Otter',
	'Panda',
	'Raven',
	'Falcon',
	'Lynx',
	'Heron',
	'Panther',
	'Jaguar',
	'Koala',
	'Penguin',
	'Robin',
	'Swan',
	'Whale',
	'Zebra'
]

function randomElement<T>(array: T[]): T {
	return array[Math.floor(Math.random() * array.length)]
}

/**
 * Generate a random 3-part name (Adjective + Color + Animal)
 * Example: "HappyBlueElephant"
 */
export function generateRandomGuestName(): string {
	return `${randomElement(ADJECTIVES)}${randomElement(COLORS)}${randomElement(ANIMALS)}`
}

/** localStorage key for persisting guest name */
export const GUEST_NAME_STORAGE_KEY = 'cloudillo:guestName'

/**
 * Get stored guest name from localStorage, or undefined if not set
 */
export function getStoredGuestName(): string | undefined {
	try {
		return localStorage.getItem(GUEST_NAME_STORAGE_KEY) || undefined
	} catch {
		return undefined
	}
}

/**
 * Store guest name in localStorage
 */
export function storeGuestName(name: string): void {
	try {
		localStorage.setItem(GUEST_NAME_STORAGE_KEY, name)
	} catch {
		// localStorage might be disabled (e.g., private browsing)
	}
}

// vim: ts=4
