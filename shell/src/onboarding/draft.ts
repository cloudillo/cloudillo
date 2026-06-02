// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useAtom } from 'jotai'

// Shared onboarding wizard draft. Holds the user's choices across step
// navigation (invites → extras) so the reversible wizard can commit
// everything at once on Finish. Lives in a module-scoped Jotai atom: it
// persists across SPA navigation between steps and resets on a full page
// reload (where the `ui.onboarding` resume gate takes over instead). The
// welcome refId is not kept here — it rides in the URL (/onboarding/:refId/…)
// so it survives a full page reload natively.
export interface OnboardingDraft {
	// Per-action accept toggles on the invites step, keyed by actionId.
	invitesChecked: Record<string, boolean>
	// Whether to create a CONN to the default Cloudillo community. Tri-state:
	// undefined until the invites loader seeds it (default-ON unless the inviter
	// already invited the user to cloudillo.net, in which case it's forced off
	// to avoid a duplicate CONN). Preserved across Back navigation once set.
	join?: boolean
	// Extras step toggles.
	enableNotifications: boolean
	enableInstall: boolean
	enablePasskey: boolean
}

export const defaultOnboardingDraft: OnboardingDraft = {
	invitesChecked: {},
	enableNotifications: false,
	enableInstall: false,
	enablePasskey: false
}

export const onboardingDraftAtom = atom<OnboardingDraft>(defaultOnboardingDraft)

export function useOnboardingDraft() {
	return useAtom(onboardingDraftAtom)
}

// vim: ts=4
