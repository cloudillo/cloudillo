// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
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

export type PickerViewMode = 'browse' | 'connected' | 'recent' | 'starred'

export interface BreadcrumbItem {
	id: string | null
	name: string
}

/** Maximum number of connected file IDs to fetch in a single batch request */
export const MAX_CONNECTED_FILE_BATCH = 50

// vim: ts=4
