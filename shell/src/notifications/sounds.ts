// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Map of sound key -> filename
export const NOTIFICATION_SOUNDS: Record<string, string> = {
	click: 'notify/click.mp3',
	drop: 'notify/drop.mp3',
	dry_bongos: 'notify/dry_bongos.mp3',
	notify: 'notify/notify.mp3'
}

// For dropdown labels (translatable)
export const SOUND_LABELS: Record<string, string> = {
	click: 'Click',
	drop: 'Drop',
	dry_bongos: 'Dry bongos',
	notify: 'Notify'
}

// vim: ts=4
