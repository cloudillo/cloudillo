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
		type?: string,
		name: string,
		profilePic?: string
		coverPic?: string
		x?: string,
		createdAt: Date
	} | undefined>("SELECT tnId, idTag, type, name, profilePic, coverPic, x, createdAt FROM tenants WHERE tnId = $tnId", { $tnId: tnId })
	return tenant ? {
		...tenant,
		type: tenant.type == 'C' ? 'community' : 'person',
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
	const res = await db.get<{ tnId: number }>(`INSERT INTO tenants (tnId, idTag, name, type, profilePic, x) VALUES
		($tnId, $idTag, $name, $type, $profilePic, $x) RETURNING tnId`, {
		$tnId: tnId,
		$idTag: idTag,
		$name: tenant.name,
		$type: tenant.type == 'community' ? 'C' : null,
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

	const res = await update<Tenant & { profilePic?: string, coverPic?: string }>('tenants', ['tnId'], { ...tenant, tnId }, 'tnId, idTag, name, profilePic, coverPic, createdAt, x')
	if (res) {
		const tenant = {
			...res,
			profilePic: res.profilePic ? JSON.parse(res.profilePic) : undefined,
			coverPic: res.coverPic ? JSON.parse(res.coverPic) : undefined,
			x: res.x ? JSON.parse('' + res.x) : {}
		} as Tenant
		return tenant
	}
}

export async function deleteTenant(tnId: number) {
	for (const table of [
		'tenants',
		'tenant_data',
		'settings',
		'subscriptions',
		'profiles',
		'tags',
		'files',
		'file_variants',
		'refs',
		'key_cache',
		'actions',
		'action_outbox',
		'action_outbox_queue',
		'action_inbox'
	]) {
		await db.run(`DELETE FROM ${table} WHERE tnId = $tnId`, { $tnId: tnId })
	}
}

// vim: ts=4
