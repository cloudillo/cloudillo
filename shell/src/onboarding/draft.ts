// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

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
	// Community idTag per community-scoped invite, keyed by actionId like
	// `invitesChecked`, so Finish can pin the accepted ones without re-fetching.
	// Genuinely absent for person-to-person CONNs, hence the optional value: a
	// `Record<string, string>` would type every lookup as present.
	inviteCommunities: Record<string, string | undefined>
	// The `onboarding.community` resolved by the invites loader ('' = none to
	// offer), so Finish joins exactly the community the card showed.
	community?: string
	// Whether to create a CONN to `community`. Tri-state: undefined until the
	// invites loader seeds it (default-ON unless there is no community or the
	// inviter already invited the user to it, in which case it's forced off to
	// avoid a duplicate CONN). Preserved across Back navigation once set.
	join?: boolean
	// Extras step toggles.
	enableNotifications: boolean
	enableInstall: boolean
	enablePasskey: boolean
}

export const defaultOnboardingDraft: OnboardingDraft = {
	invitesChecked: {},
	inviteCommunities: {},
	enableNotifications: false,
	enableInstall: false,
	enablePasskey: false
}

export const onboardingDraftAtom = atom<OnboardingDraft>(defaultOnboardingDraft)

export function useOnboardingDraft() {
	return useAtom(onboardingDraftAtom)
}

// vim: ts=4
