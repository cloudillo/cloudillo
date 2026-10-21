// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type ApiClient, FetchError } from '@cloudillo/core'

/** Where the onboarding wizard continues once the user is signed in.
 *
 *  IDP-typed registrations should already have cleared `ui.onboarding` via the
 *  refId-scoped IDP-status call. The `verify-idp` redirect remains as a defensive
 *  fallback for races where the clear hasn't propagated yet. Defaults to the invites
 *  step, which fetches any pending CONN/INVT invitations and silently advances to
 *  `join` when there are none. Needs the API token already set. */
export async function onboardingNextPath(api: ApiClient, refId: string): Promise<string> {
	let nextPath = '/onboarding/' + refId + '/invites'
	try {
		const setting = await api.settings.get('ui.onboarding')
		if (setting.value === 'verify-idp') {
			nextPath = '/onboarding/' + refId + '/verify-idp'
		}
	} catch (settingsErr) {
		// 404 = no onboarding gate engaged → /onboarding/invites is correct.
		if (!(settingsErr instanceof FetchError && settingsErr.httpStatus === 404)) {
			console.warn(
				'Failed to read ui.onboarding after setPassword, defaulting to join:',
				settingsErr
			)
		}
	}
	return nextPath
}
