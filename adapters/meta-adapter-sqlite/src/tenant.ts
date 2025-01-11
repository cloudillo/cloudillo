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
import { Tenant, TenantData, TenantPatch } from '@cloudillo/server/types/meta-adapter'

import { db, ql, update } from './db.js'

export async function readTenant(tnId: number): Promise<Tenant | undefined> {
	const tenant = await db.get<{
		tnId: number,
		idTag: string,
		name: string,
		profilePic?: string
		coverPic?: string
		x?: string,
		createdAt: Date
	} | undefined>("SELECT tnId, idTag, name, profilePic, coverPic, x, createdAt FROM tenants WHERE tnId = $tnId", { $tnId: tnId })
	return tenant ? {
		...tenant,
		profilePic: tenant.profilePic ? JSON.parse(tenant.profilePic) : undefined,
		coverPic: tenant.coverPic ? JSON.parse(tenant.coverPic) : undefined,
		x: tenant.x ? JSON.parse(tenant.x) : {}
	} : undefined
}

export async function getTenantIdentityTag(tnId: number) {
	const res = await db.get<{ idTag: string }>("SELECT idTag FROM tenants WHERE tnId = $tnId", { $tnId: tnId })
	return res?.idTag
}

export async function createTenant(tnId: number, idTag: string, tenant: TenantData) {
	const res = await db.get<{ tnId: number }>(`INSERT INTO tenants (tnId, idTag, name, profilePic, x) VALUES
		($tnId, $idTag, $name, $profilePic, $x) RETURNING tnId`, {
		$tnId: tnId,
		$idTag: idTag,
		$name: tenant.name,
		$profilePic: tenant.profilePic,
		$x: JSON.stringify({ ...tenant, tag: undefined, name: undefined, profilePic: undefined })
	})
	return res.tnId
}

export async function updateTenant(tnId: number, tenant: TenantPatch): Promise<Tenant | undefined> {
	let x: Record<string, unknown>

	if (tenant.x) {
		const old = await db.get<{ x?: string }>('SELECT x FROM tenants WHERE tnId = $tnId', { $tnId: tnId })
		x = old.x ? JSON.parse(old.x) : {}
		for (const [k, v] of Object.entries(tenant.x)) {
			if (v !== undefined) {
				x[k] = v
			}
		}
	}

	const res = await update<Tenant>('tenants', ['tnId'], { ...tenant, tnId }, 'tnId, idTag, name, profilePic, createdAt, x')
	if (res) {
		const tenant = { ...res, x: res.x ? JSON.parse('' + res.x) : {} } as Tenant
		return tenant
	}
}

// vim: ts=4
