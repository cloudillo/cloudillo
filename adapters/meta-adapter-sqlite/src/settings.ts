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

import * as T from '@symbion/runtype'
import { ListSettingsOptions } from '@cloudillo/server/types/meta-adapter'

import { db, ql } from './db.js'

export async function listSettings(tnId: number, opts: ListSettingsOptions = {}): Promise<Record<string, string | number | boolean | undefined>> {
	const q = "SELECT name, value FROM settings WHERE tnId = $tnId"
		+ (opts.prefix ? " AND (" + opts.prefix.map(prefix => `name LIKE ${ql(prefix + '.%')}`).join(' OR ') + ")" : '')
	console.log('Query:', q)
	const rows = await db.all<{ name: string, value: string }>(q, { $tnId: tnId })
	return rows.reduce((acc, row) => ({ ...acc, [row.name]: row.value }), {})
}

export async function readSetting(tnId: number, name: string) {
	const res = await db.get<{ value?: string | number | boolean }>(
		"SELECT value FROM settings WHERE tnId = $tnId AND name = $name", { $tnId: tnId, $name: name }
	)
	return res?.value
}

export async function updateSetting(tnId: number, name: string, value?: string | number | boolean | null) {
	if (value == null) {
		await db.run('DELETE FROM settings WHERE tnId = $tnId AND name = $name', { $tnId: tnId, $name: name })
	} else {
		await db.run('INSERT OR REPLACE INTO settings (tnId, name, value) VALUES ($tnId, $name, $value)', {
			$tnId: tnId,
			$name: name,
			$value: value
		})
	}
}

// vim: ts=4
