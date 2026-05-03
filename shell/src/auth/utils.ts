// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export function validPassword(password: string) {
	return password.length >= 8
}

export type PasswordStrength = {
	score: number
	label: string
	percent: number
}

export function passwordStrength(password: string): PasswordStrength {
	if (!password || password.length < 8) return { score: 0, label: 'Too short', percent: 0 }

	let score = 1
	if (password.length >= 12) score++
	if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
	if (/\d/.test(password)) score++
	if (/[^a-zA-Z0-9]/.test(password)) score++

	score = Math.min(4, score)
	const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
	return { score, label: labels[score], percent: score * 25 }
}

export function validIdTag(idTag: string) {
	return idTag.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}
