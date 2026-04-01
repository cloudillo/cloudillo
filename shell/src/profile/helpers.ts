// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export function validIdentityTag(idTag: string) {
	return idTag.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}
// vim: ts=4
