// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export function validPassword(password: string) {
	return password.length >= 8
}

export function validIdTag(idTag: string) {
	return idTag.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}
