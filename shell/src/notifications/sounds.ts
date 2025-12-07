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
