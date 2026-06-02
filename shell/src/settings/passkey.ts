// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import { startRegistration } from '@simplewebauthn/browser'

// Register a new WebAuthn passkey for the authenticated user. Shared by the
// Security settings screen and the onboarding Extras step. Callers handle a
// thrown `NotAllowedError` (user cancelled the OS prompt) as a non-fatal skip.
export async function registerPasskey(api: ApiClient, description?: string): Promise<void> {
	// Get registration challenge
	const challengeData = await api.auth.getWebAuthnRegChallenge()

	// Start browser registration
	// Note: options come from webauthn-rs which may have slightly different types
	const response = await startRegistration({
		optionsJSON: challengeData.options as Parameters<typeof startRegistration>[0]['optionsJSON']
	})

	// Complete registration with backend
	await api.auth.registerWebAuthnCredential({
		token: challengeData.token,
		response,
		description: description || undefined
	})
}

// vim: ts=4
