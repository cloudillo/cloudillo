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

import { db, ql } from './db.js'

export async function listSubscriptions(tnId: number) {
	const rows = await db.all<{ subsId: number, subscription: string, idTag: string }>(
		`SELECT s.subsId, s.subscription, t.idTag FROM subscriptions s
		JOIN tenants t ON t.tnId = s.tnId
		WHERE s.tnId = $tnId
	`, { $tnId: tnId })
	return rows.map(row => ({
		id: row.subsId,
		subscription: JSON.parse(row.subscription),
		idTag: row.idTag
	}))
}

export async function createSubscription(tnId: number, subscription: unknown) {
	await db.run('INSERT INTO subscriptions (tnId, subscription) VALUES ($tnId, $subscription)', {
		$tnId: tnId,
		$subscription: JSON.stringify(subscription)
	})
}

export async function deleteSubscription(tnId: number, id: number) {
	await db.run('DELETE FROM subscriptions WHERE tnId = $tnId AND subsId = $id', {
		$tnId: tnId,
		$id: id
	})
}

// vim: ts=4
