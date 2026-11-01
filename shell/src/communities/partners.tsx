// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Community partnerships. `PartnersManager` is the hub (embedded in `/@comm/communities`):
 * incoming and sent requests above, the partner list below, enter-first — a row click enters
 * the peer wearing this community's hat; the row's edit action opens the access editor.
 * `ProposePartnershipDialog` is the one way to propose, shared by the hub and the profile
 * page's `ProposePartnershipButton`. Everything runs through the proposing community's
 * context token.
 */

import type { ApiClient } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	EmptyState,
	Field,
	Heading,
	IcAdd,
	IcEdit,
	Icon,
	IdentityTag,
	List,
	ListItem,
	LoadError,
	LoadingSpinner,
	NativeSelect,
	ProfilePicture,
	ProfileSelect,
	RadioGroup,
	Segmented,
	SegmentedItem,
	Tag,
	Text,
	TextArea,
	useApi,
	useAuth,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import type { ActionView, CommunityRole, Profile } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	activeContextAtom,
	type CommunityRef,
	fromCommunity,
	isContextLeader,
	partnerRequestsVersionAtom,
	useActiveCommunity,
	useApiContext,
	useLedCommunities
} from '../context/index.js'
import { IcEnter, IcPartner } from '../icons.js'
import { PendingRequestsList } from '../profile/community-requests.js'
import { ProfileStatusBadge } from '../profile/identities.js'
import { roleLabels } from '../profile/role-labels.js'
import { contextPath, ctxBase } from '../routes.js'
import {
	effectiveHatRoles,
	formatHatRoles,
	HAT_PRESETS,
	HAT_TARGET_ROLES,
	type HatPresetId,
	hatPresetOf,
	hatRoleRanges,
	hatRolesChanged,
	parseHatRoles
} from '../settings/hat-roles.js'
import { useMapActions } from './CommunityMap.js'

function roleLabel(t: TFunction, role: string): string {
	return roleLabels(t)[role as CommunityRole] ?? role
}

function rolePlural(t: TFunction, role: string): string {
	switch (role) {
		case 'supporter':
			return t('Supporters')
		case 'contributor':
			return t('Contributors')
		case 'moderator':
			return t('Moderators')
		case 'leader':
			return t('Leaders')
		default:
			return role
	}
}

/** One sentence per `hatRoleRanges` run, e.g. "Supporters and above join here as Supporter." */
export function rangeSentences(t: TFunction, map: Record<string, string>): string[] {
	return hatRoleRanges(map).map(({ lo, hi, local }) => {
		const opts = { role: rolePlural(t, lo), hi: rolePlural(t, hi), local: roleLabel(t, local) }
		if (lo === hi) return t('{{role}} join here as {{local}}.', opts)
		if (hi === 'leader') return t('{{role}} and above join here as {{local}}.', opts)
		return t('{{role}} to {{hi}} join here as {{local}}.', opts)
	})
}

function presetText(t: TFunction, id: HatPresetId): { label: string; description: string } {
	switch (id) {
		case 'none':
			return { label: t('No access'), description: t("Their members can't act here.") }
		case 'follow':
			return {
				label: t('Follow along'),
				description: t('Supporters and above can read along as Followers.')
			}
		case 'participate':
			return {
				label: t('Participate'),
				description: t('Supporters and above join as Supporters.')
			}
		case 'mirror':
			return {
				label: t('Mirror roles'),
				description: t(
					'Supporters stay Supporters, Contributors and above become Contributors.'
				)
			}
	}
}

/** The preset's label when the map spells one, else its range sentences; "No access granted" for none. */
function describeMap(t: TFunction, s: string | null | undefined): string {
	const preset = hatPresetOf(s)
	if (preset && preset !== 'custom') return presetText(t, preset).label
	return rangeSentences(t, parseHatRoles(s)).join(' · ') || t('No access granted')
}

/** A hat entry only works where the partner grants our members a role; suspended rows never enter. */
function canEnter(p: { status?: string; peerHatRoles?: string | null }): boolean {
	return p.status !== 'S' && Object.keys(parseHatRoles(p.peerHatRoles)).length > 0
}

/** Today's per-role grid, behind the picker's "Custom…". */
function HatRolesGrid({
	map,
	onChange
}: {
	map: Record<string, string>
	onChange: (map: Record<string, string>) => void
}) {
	const { t } = useTranslation()
	const summary = rangeSentences(t, map)
	return (
		<VBox gap={2}>
			<Alert color="info" compact>
				{summary.length ? summary.join(' ') : t('No access yet: set a role below.')}
			</Alert>
			{/* Highest first, so an unset row reads "same as" a row below it */}
			{effectiveHatRoles(map)
				.reverse()
				.map(({ peer: peerRole, local, from }) => (
					<Field
						key={peerRole}
						label={roleLabel(t, peerRole)}
						hint={
							!map[peerRole] &&
							(local && from
								? t('Gets {{role}}, same as {{from}}', {
										role: roleLabel(t, local),
										from: roleLabel(t, from)
									})
								: t('No access'))
						}
					>
						<Segmented
							size="sm"
							layout="grid"
							style={{ '--segmented-min': '6rem' } as React.CSSProperties}
							aria-label={t('Role here for {{role}}', {
								role: roleLabel(t, peerRole)
							})}
							value={map[peerRole] ?? ''}
							onChange={(v) => onChange({ ...map, [peerRole]: v })}
						>
							<SegmentedItem value="">{t('Not set')}</SegmentedItem>
							{HAT_TARGET_ROLES.map((role) => (
								<SegmentedItem key={role} value={role}>
									{roleLabel(t, role)}
								</SegmentedItem>
							))}
						</Segmented>
					</Field>
				))}
			<Text as="p" size="sm" emphasis="muted">
				{t("Followers can't act with a hat.")}
			</Text>
		</VBox>
	)
}

/**
 * "Their members get here:" as presets plus "Custom…" (the per-role grid). `value` is a map
 * string, `null` while nothing is chosen; a map matching no preset opens as Custom.
 */
export function AccessPresetPicker({
	value,
	onChange,
	label
}: {
	value: string | null
	onChange: (map: string) => void
	label?: string
}) {
	const { t } = useTranslation()
	const [custom, setCustom] = React.useState(() => hatPresetOf(value) === 'custom')
	const selected = custom ? 'custom' : (hatPresetOf(value) ?? undefined)

	return (
		<VBox gap={2}>
			<Field label={label ?? t('Their members get here:')}>
				<RadioGroup<HatPresetId | 'custom'>
					value={selected}
					options={[
						...HAT_PRESETS.map((p) => ({ value: p.id, ...presetText(t, p.id) })),
						{
							value: 'custom' as const,
							label: t('Custom…'),
							description: t('Choose a role for each of their roles.')
						}
					]}
					onChange={(id) => {
						setCustom(id === 'custom')
						// Custom keeps the value: a null map stays unset until a role is picked
						if (id !== 'custom')
							onChange(HAT_PRESETS.find((p) => p.id === id)?.map ?? '')
					}}
				/>
			</Field>
			{custom && (
				<HatRolesGrid
					map={parseHatRoles(value)}
					onChange={(map) => onChange(formatHatRoles(map))}
				/>
			)}
		</VBox>
	)
}

/** Where `from` stands toward `target`, read on `from`'s node; `null` for no relation. */
export type PartnershipState = 'partner' | 'incoming' | 'sent' | null

export async function partnershipState(
	client: ApiClient,
	from: string,
	target: string
): Promise<PartnershipState> {
	// Same rule as the hub's partner list (`PartnersManager`), so the two can't disagree
	const [partner, incoming, sent] = await Promise.all([
		client.profiles.list({ idTag: target, connected: true, status: ['A', 'M', 'S'] }),
		client.actions.list({ type: 'CONN', issuer: target, audience: from, status: ['C', 'P'] }),
		client.profiles.list({ idTag: target, connected: 'R' })
	])
	if (partner?.length) return 'partner'
	if ((incoming as ActionView[]).some((a) => a.issuer.idTag === target)) return 'incoming'
	return sent?.length ? 'sent' : null
}

/** No proposing from `idTag`: still loading, or already related (partner, sent, or they asked). */
export function proposeBlocked(
	states: Record<string, PartnershipState>,
	idTag: string,
	targetTag: string | undefined
): boolean {
	return (!!targetTag && !(idTag in states)) || states[idTag] != null
}

/** The preferred option unless it is blocked, else the first open one, else the preferred. */
export function defaultFrom(
	options: Pick<CommunityRef, 'idTag'>[],
	preferred: string | undefined,
	isBlocked: (idTag: string) => boolean
): string | undefined {
	const first =
		preferred && options.some((o) => o.idTag === preferred) ? preferred : options[0]?.idTag
	if (!first || !isBlocked(first)) return first
	return options.find((o) => !isBlocked(o.idTag))?.idTag ?? first
}

function stateLabel(t: TFunction, state: PartnershipState): string | undefined {
	switch (state) {
		case 'partner':
			return t('Partner')
		case 'incoming':
			return t('Wants to partner')
		case 'sent':
			return t('Request sent')
	}
}

interface ProposeProps {
	onClose: () => void
	/** Fixed target (the profile page); else picked with a search */
	target?: Pick<Profile, 'idTag' | 'name'>
	/** Preselected among `fromOptions`, when it is one */
	from?: string
	/** Communities the user may propose as; each shows its state toward the target */
	fromOptions: Pick<CommunityRef, 'idTag' | 'name'>[]
	/** idTags the target search leaves out (existing partners) */
	exclude?: string[]
}

/**
 * Each `from`'s state toward `target`; a key appears once its lookup settles.
 * Passive token: a community the trust gate keeps anonymous reads as unknown.
 */
// refetched per mount/version bump; an open page misses the peer's answer until then
function usePartnershipStates(
	fromOptions: Pick<CommunityRef, 'idTag'>[],
	targetTag: string | undefined
): Record<string, PartnershipState> {
	const { getClientFor, getTokenFor } = useApiContext()
	const version = useAtomValue(partnerRequestsVersionAtom)
	// Keyed by target: a reload keeps the old values, a new target starts empty
	const [loaded, setLoaded] = React.useState<{
		of?: string
		states: Record<string, PartnershipState>
	}>({ states: {} })

	React.useEffect(
		function loadStates() {
			if (!targetTag) return
			let cancelled = false
			const put = (idTag: string, s: PartnershipState) =>
				setLoaded((prev) => ({
					of: targetTag,
					states: { ...(prev.of === targetTag ? prev.states : {}), [idTag]: s }
				}))
			for (const o of fromOptions) {
				;(async () => {
					const client = (await getTokenFor(o.idTag)) && getClientFor(o.idTag)
					return client ? partnershipState(client, o.idTag, targetTag) : null
				})()
					.then((s) => {
						if (!cancelled) put(o.idTag, s)
					})
					.catch((err) => {
						console.warn('Failed to read partnership state', err)
						// Unknown, not blocked: a failed lookup must not lock Next forever
						if (!cancelled) put(o.idTag, null)
					})
			}
			return () => {
				cancelled = true
			}
		},
		[fromOptions, targetTag, getClientFor, getTokenFor, version]
	)
	return loaded.of === targetTag ? loaded.states : {}
}

/** Two steps: from / target / note, then the access map ("Decide later" skips it). */
export function ProposePartnershipDialog({ open, ...props }: ProposeProps & { open: boolean }) {
	const { t } = useTranslation()
	return (
		<Dialog open={open} onClose={props.onClose} size="md" title={t('Propose partnership')}>
			{open && <ProposeBody {...props} />}
		</Dialog>
	)
}

function ProposeBody({ onClose, target: fixedTarget, from, fromOptions, exclude }: ProposeProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const { getClientFor } = useApiContext()
	const toast = useToast()
	const bumpRequests = useSetAtom(partnerRequestsVersionAtom)
	const [step, setStep] = React.useState<1 | 2>(1)
	const [target, setTarget] = React.useState<Pick<Profile, 'idTag' | 'name'> | undefined>(
		fixedTarget
	)
	const [note, setNote] = React.useState('')
	const [map, setMap] = React.useState<string | null>(null)
	const [busy, setBusy] = React.useState(false)
	const [mode, setMode] = React.useState<'A' | 'M' | 'I'>()
	const targetTag = target?.idTag
	const states = usePartnershipStates(fromOptions, targetTag)
	const blocked = (idTag: string) => proposeBlocked(states, idTag, targetTag)
	const [picked, setPicked] = React.useState<string>()
	// Skip blocked options only once every state is in, so the default doesn't hop while loading
	const settled = !targetTag || fromOptions.every((o) => o.idTag in states)
	const fromTag = picked ?? defaultFrom(fromOptions, from, settled ? blocked : () => false)

	// The target's join policy, read from its own node
	React.useEffect(
		function loadMode() {
			setMode(undefined)
			if (!api || !targetTag) return
			let cancelled = false
			api.profiles
				.getRemoteFull(targetTag)
				.then((p) => {
					if (!cancelled) setMode(p.settings?.connectionMode)
				})
				.catch(() => {})
			return () => {
				cancelled = true
			}
		},
		[api, targetTag]
	)

	// Discovery runs on the home node, plus a remote lookup for a typed idTag it doesn't know
	async function listCommunities(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		const skip = new Set([fromTag, ...(exclude ?? [])])
		const list = ((await api.profiles.list({ q, type: 'community' })) ?? []).filter(
			(p) => !skip.has(p.idTag)
		)
		const idTag = q.trim().toLowerCase()
		if (idTag.includes('.') && !skip.has(idTag) && !list.some((p) => p.idTag === idTag)) {
			try {
				const p = await api.profiles.getRemoteFull(idTag)
				if (p.type === 'community' && p.idTag === idTag) {
					list.unshift({ idTag, name: p.name, type: p.type, profilePic: p.profilePic })
				}
			} catch {
				// Not a reachable community: the local results stand
			}
		}
		return list
	}

	async function send(hatRoles: string | null) {
		const client = fromTag && getClientFor(fromTag, { explicit: true })
		if (!client || !target) return
		setBusy(true)
		try {
			await client.actions.create({ type: 'CONN', audienceTag: target.idTag, content: note })
		} catch (err) {
			console.error('Failed to send partnership request', err)
			toast.error(t('Failed to send request'))
			setBusy(false)
			return
		}
		// Saved on our side while pending; the backend publishes it once they accept
		if (hatRoles != null && !(await saveHatRoles(client, target.idTag, hatRoles))) {
			toast.warning(t('Request sent, but the access could not be saved'))
		} else {
			toast.success(t('Request sent'))
		}
		bumpRequests((n) => n + 1)
		onClose()
	}

	const targetName = target?.name || target?.idTag
	const fromName = fromOptions.find((o) => o.idTag === fromTag)?.name || fromTag

	if (step === 2) {
		return (
			<VBox gap={2}>
				<Text as="p" emphasis="muted">
					{t(
						'Members of {{name}} can act in {{from}} with a role you choose. You can change it any time.',
						{ name: targetName, from: fromName }
					)}
				</Text>
				<AccessPresetPicker value={map} onChange={setMap} />
				<ActionBar>
					<Button disabled={busy} onClick={() => setStep(1)}>
						{t('Back')}
					</Button>
					<Button disabled={busy} onClick={() => send(null)}>
						{t('Decide later')}
					</Button>
					<Button
						color="primary"
						disabled={busy || map == null}
						onClick={() => send(map)}
					>
						{t('Send request')}
					</Button>
				</ActionBar>
			</VBox>
		)
	}

	return (
		<VBox gap={2}>
			{fromOptions.length > 1 && (
				<Field label={t('From')}>
					<NativeSelect value={fromTag} onChange={(e) => setPicked(e.target.value)}>
						{fromOptions.map((o) => {
							const state = stateLabel(t, states[o.idTag] ?? null)
							return (
								<option key={o.idTag} value={o.idTag} disabled={blocked(o.idTag)}>
									{state ? `${o.name || o.idTag} · ${state}` : o.name || o.idTag}
								</option>
							)
						})}
					</NativeSelect>
				</Field>
			)}
			{fixedTarget ? (
				<Text as="p">
					{t('Send a partnership request from {{from}} to {{name}}?', {
						from: fromName,
						name: targetName
					})}
				</Text>
			) : (
				<Field label={t('Community')}>
					<ProfileSelect
						placeholder={t('Search communities or type an identity tag...')}
						listProfiles={listCommunities}
						value={target as Profile | undefined}
						onChange={setTarget}
					/>
				</Field>
			)}
			{mode === 'A' && (
				<Text size="sm" emphasis="muted">
					{t('Accepts automatically')}
				</Text>
			)}
			{mode === 'M' && (
				<Text size="sm" emphasis="muted">
					{t('Approval needed')}
				</Text>
			)}
			<Field label={t('Note')}>
				<TextArea
					rows={3}
					value={note}
					placeholder={t('Personalize the connection request')}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
						setNote(e.target.value)
					}
				/>
			</Field>
			<ActionBar>
				<Button onClick={onClose}>{t('Cancel')}</Button>
				<Button
					color="primary"
					disabled={!target || !fromTag || blocked(fromTag)}
					disabledReason={
						!target
							? t('Pick a community first')
							: fromTag && !(fromTag in states)
								? t('Checking partnership status…')
								: fromTag && states[fromTag] === 'incoming'
									? t('They already asked: answer their request instead')
									: fromTag
										? stateLabel(t, states[fromTag] ?? null)
										: undefined
					}
					onClick={() => setStep(2)}
				>
					{t('Next')}
				</Button>
			</ActionBar>
		</VBox>
	)
}

/** B's profile: propose as any community I lead (other than B). */
export function ProposePartnershipButton({ target }: { target: Pick<Profile, 'idTag' | 'name'> }) {
	const { t } = useTranslation()
	const active = useAtomValue(activeContextAtom)
	const led = useLedCommunities()
	const [open, setOpen] = React.useState(false)
	const options = React.useMemo(
		() => led.filter((c) => c.idTag !== target.idTag),
		[led, target.idTag]
	)
	const states = usePartnershipStates(options, target.idTag)
	// Nothing left to propose: every community I lead is related already (partner, sent, asked)
	const done = options.every((o) => states[o.idTag] != null)
	if (!options.length || done) return null
	return (
		<>
			<Button icon={<IcPartner />} onClick={() => setOpen(true)}>
				{t('Propose partnership…')}
			</Button>
			<ProposePartnershipDialog
				open={open}
				onClose={() => setOpen(false)}
				target={target}
				from={active?.idTag}
				fromOptions={options}
			/>
		</>
	)
}

/** "A: Partner" on B's profile, while acting as a community A I lead; links to A's hub. */
export function PartnershipChip({ target }: { target: string }) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const from =
		community &&
		community.idTag !== target &&
		!community.hat &&
		isContextLeader(community, auth?.idTag)
			? community.idTag
			: undefined
	const fromOptions = React.useMemo(() => (from ? [{ idTag: from }] : []), [from])
	const state = usePartnershipStates(fromOptions, target)[from ?? ''] ?? null

	const label = stateLabel(t, state)
	if (!community || !from || !label) return null
	return (
		<Tag
			size="sm"
			icon={<IcPartner />}
			href={contextPath(ctxBase(from, auth?.idTag), 'communities')}
		>
			{`${community.name || from}: ${label}`}
		</Tag>
	)
}

/** Saves the access map we grant `peer`; logs and returns false on failure. */
function saveHatRoles(client: ApiClient, peer: string, hatRoles: string): Promise<boolean> {
	return client.profiles.adminUpdate(peer, { hatRoles }).then(
		() => true,
		(err) => {
			console.error('Failed to save partner access', err)
			return false
		}
	)
}

/** Accepting an incoming request: the access step first, since `CONN:ACC` carries our map. */
function AcceptBody({
	client,
	action,
	onDone
}: {
	client: ApiClient
	action: ActionView
	onDone: () => void
}) {
	const { t } = useTranslation()
	const toast = useToast()
	const [map, setMap] = React.useState<string | null>(null)
	const [busy, setBusy] = React.useState(false)
	const peer = action.issuer.idTag
	const name = action.issuer.name || peer

	async function accept(hatRoles: string | null) {
		setBusy(true)
		let saved = true
		if (hatRoles != null) {
			// Before the accept, so it rides on CONN:ACC; a missing row is retried after
			saved = await saveHatRoles(client, peer, hatRoles)
		}
		try {
			await client.actions.accept(action.actionId)
		} catch (err) {
			console.error('Failed to approve partnership request', err)
			// Not partners after all: don't leave the pre-saved map behind
			if (hatRoles != null && saved) {
				client.profiles
					.adminUpdate(peer, { hatRoles: null })
					.catch((e) => console.error('Failed to roll back partner access', e))
			}
			toast.error(t('Failed to approve request'))
			setBusy(false)
			return
		}
		// Now connected, so the change goes out as CONN:UPD
		if (hatRoles != null && !saved && !(await saveHatRoles(client, peer, hatRoles))) {
			toast.warning(t('Request approved, but the access could not be saved'))
		} else {
			toast.success(t('Request approved'))
		}
		onDone()
	}

	return (
		<VBox gap={2}>
			<AccessPresetPicker
				value={map}
				onChange={setMap}
				label={t("What do {{name}}'s members get here?", { name })}
			/>
			<ActionBar>
				<Button disabled={busy} onClick={() => accept(null)}>
					{t('Decide later')}
				</Button>
				<Button color="primary" disabled={busy || map == null} onClick={() => accept(map)}>
					{t('Accept')}
				</Button>
			</ActionBar>
		</VBox>
	)
}

/** Requests this community sent and are still unanswered. */
function SentRequests({
	client,
	version,
	onChange
}: {
	client: ApiClient
	version: number
	onChange: () => void
}) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const [sent, setSent] = React.useState<Profile[]>([])

	React.useEffect(
		function loadSent() {
			let cancelled = false
			client.profiles
				.list({ type: 'community', connected: 'R' })
				.then((list) => {
					if (!cancelled) setSent(list ?? [])
				})
				.catch((err) => console.error('Failed to load sent requests', err))
			return () => {
				cancelled = true
			}
		},
		[client, version]
	)

	async function cancel(p: Profile) {
		const ok = await dialog.confirm(
			t('Cancel request'),
			t('Withdraw the partnership request to {{name}}?', { name: p.name || p.idTag }),
			{ confirmLabel: t('Cancel request') }
		)
		if (!ok) return
		try {
			await client.actions.create({ type: 'CONN', subType: 'DEL', audienceTag: p.idTag })
			toast.success(t('Request cancelled'))
			onChange()
		} catch (err) {
			console.error('Failed to cancel partnership request', err)
			toast.error(t('Failed to cancel request'))
		}
	}

	if (!sent.length) return null
	return (
		<>
			<Heading level={4} className="mb-1">
				{t('Sent')}
			</Heading>
			<List variant="divided" aria-label={t('Sent requests')}>
				{sent.map((p) => (
					<ListItem
						key={p.idTag}
						leading={<ProfilePicture profile={p} srcTag={p.idTag} />}
						title={p.name || p.idTag}
						subtitle={<IdentityTag idTag={p.idTag} />}
						trailing={<Button onClick={() => cancel(p)}>{t('Cancel request')}</Button>}
					/>
				))}
			</List>
		</>
	)
}

function PartnerRow({
	p,
	enterLabel,
	onEdit,
	onUnsuspend,
	onEnter
}: {
	p: Profile
	enterLabel: string
	onEdit: () => void
	onUnsuspend: () => void
	onEnter: () => void
}) {
	const { t } = useTranslation()
	// The row click enters, so its buttons must not bubble
	const edit = (e: React.MouseEvent) => {
		e.stopPropagation()
		onEdit()
	}
	return (
		<ListItem
			leading={<ProfilePicture profile={p} srcTag={p.idTag} />}
			title={p.name || p.idTag}
			actions={
				<Button
					variant="ghost"
					icon={<IcEdit />}
					aria-label={t('Edit access')}
					onClick={edit}
				/>
			}
			trailing={
				<>
					<ProfileStatusBadge profile={p} />
					{p.status === 'S' ? (
						<Button
							size="sm"
							onClick={(e) => {
								e.stopPropagation()
								onUnsuspend()
							}}
						>
							{t('Unsuspend')}
						</Button>
					) : (
						canEnter(p) && <Icon as={IcEnter} label={enterLabel} />
					)}
				</>
			}
			onClick={canEnter(p) ? onEnter : undefined}
		>
			{p.hatRoles == null ? (
				<Text as="div" size="sm" emphasis="muted">
					{t('No access set')}
				</Text>
			) : (
				<Text as="div" size="sm" emphasis="muted">
					{t('Their members here: {{roles}}', {
						roles: describeMap(t, p.hatRoles)
					})}
				</Text>
			)}
			<Text as="div" size="sm" emphasis="muted">
				{t('Our members there: {{roles}}', {
					roles: describeMap(t, p.peerHatRoles)
				})}
			</Text>
		</ListItem>
	)
}

export function PartnersManager() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const { getClientFor } = useApiContext()
	const mapActions = useMapActions()
	const toast = useToast()
	const bumpRequests = useSetAtom(partnerRequestsVersionAtom)
	const communityIdTag = community?.idTag
	const allowed = !!community && isContextLeader(community, auth?.idTag)
	const client = React.useMemo(
		() => (allowed && communityIdTag ? getClientFor(communityIdTag, { explicit: true }) : null),
		[allowed, communityIdTag, getClientFor]
	)

	const [peers, setPeers] = React.useState<Profile[]>()
	const [peersError, setPeersError] = React.useState<unknown>()
	const [peersOf, setPeersOf] = React.useState(communityIdTag)
	if (peersOf !== communityIdTag) {
		setPeersOf(communityIdTag)
		setPeers(undefined)
		setPeersError(undefined)
	}
	const version = useAtomValue(partnerRequestsVersionAtom)
	const reload = React.useCallback(() => bumpRequests((n) => n + 1), [bumpRequests])
	const [editing, setEditing] = React.useState<Profile>()
	const [connecting, setConnecting] = React.useState(false)
	const [answering, setAnswering] = React.useState<ActionView>()
	// Memoized: the dialog reloads its states when this changes
	const communityName = community?.name
	const fromSelf = React.useMemo(
		() => (communityIdTag ? [{ idTag: communityIdTag, name: communityName ?? '' }] : []),
		[communityIdTag, communityName]
	)

	React.useEffect(
		function loadPeers() {
			if (!client) return
			let cancelled = false
			client.profiles
				// Leader-only page, so `status` applies: show unreachable (S) partners too.
				.list({ type: 'community', connected: true, status: ['A', 'M', 'S'] })
				.then((list) => {
					if (cancelled) return
					setPeers(list.filter((p) => p.idTag !== communityIdTag))
					setPeersError(undefined)
				})
				.catch((err) => {
					console.error('Failed to load partner communities', err)
					if (cancelled) return
					setPeersError(err)
					setPeers([])
				})
			return () => {
				cancelled = true
			}
		},
		[client, communityIdTag, version]
	)

	async function unsuspend(peer: Profile) {
		if (!client) return
		try {
			await client.profiles.adminUpdate(peer.idTag, { status: 'A' })
			toast.success(t('Partner unsuspended'))
			reload()
		} catch (err) {
			console.error('Failed to unsuspend partner:', err)
			toast.error(t('Failed to unsuspend partner'))
		}
	}

	if (!client || !community) return null

	const connectButton = (
		<Button className="mt-2" icon={<IcAdd />} onClick={() => setConnecting(true)}>
			{t('Propose partnership…')}
		</Button>
	)
	const enterLabel = t('Enter as {{name}} member', { name: community.name || community.idTag })

	return (
		<>
			<PendingRequestsList
				// Reloads after an accept, which runs out here
				version={version}
				communityIdTag={community.idTag}
				getClientFor={getClientFor}
				onChange={reload}
				filter={fromCommunity}
				onApprove={setAnswering}
				title={
					<Heading level={4} className="mb-1">
						{t('Incoming requests')}
					</Heading>
				}
			/>
			<SentRequests client={client} version={version} onChange={reload} />

			{!peers ? (
				<LoadingSpinner />
			) : peersError && peers.length === 0 ? (
				<LoadError
					error={peersError}
					onRetry={reload}
					title={t("Couldn't load partner communities")}
				/>
			) : peers.length === 0 ? (
				<EmptyState
					icon={<IcPartner />}
					title={t('No partner communities yet')}
					description={t("Partners' members can act here with the role you grant them.")}
					action={connectButton}
				/>
			) : (
				<>
					<Heading level={4} className="mb-1">
						{t('Partner communities')}
					</Heading>
					<List variant="divided" aria-label={t('Partner communities')}>
						{peers.map((p) => (
							<PartnerRow
								key={p.idTag}
								p={p}
								enterLabel={enterLabel}
								onEdit={() => setEditing(p)}
								onUnsuspend={() => unsuspend(p)}
								onEnter={() => mapActions.enterVia(p.idTag, community.idTag)}
							/>
						))}
					</List>
					{connectButton}
				</>
			)}

			<ProposePartnershipDialog
				open={connecting}
				onClose={() => setConnecting(false)}
				fromOptions={fromSelf}
				exclude={peers?.map((p) => p.idTag)}
			/>

			<Dialog
				open={!!answering}
				onClose={() => setAnswering(undefined)}
				size="md"
				title={answering && (answering.issuer.name || answering.issuer.idTag)}
			>
				{answering && (
					<AcceptBody
						client={client}
						action={answering}
						onDone={() => {
							setAnswering(undefined)
							reload()
						}}
					/>
				)}
			</Dialog>

			<Dialog
				open={!!editing}
				onClose={() => setEditing(undefined)}
				size="md"
				title={editing && (editing.name || editing.idTag)}
			>
				{editing && (
					<HatRolesEditor
						key={editing.idTag}
						peer={editing}
						onDone={() => {
							setEditing(undefined)
							reload()
						}}
					/>
				)}
			</Dialog>
		</>
	)
}

function HatRolesEditor({ peer, onDone }: { peer: Profile; onDone: () => void }) {
	const { t } = useTranslation()
	const community = useActiveCommunity()
	const { getClientFor } = useApiContext()
	const dialog = useDialog()
	const toast = useToast()
	const [map, setMap] = React.useState<string | null>(peer.hatRoles ?? null)
	const [busy, setBusy] = React.useState(false)
	const name = peer.name || peer.idTag
	const changed = hatRolesChanged(map, peer.hatRoles)

	async function run(fn: (client: ApiClient) => Promise<unknown>) {
		const client = community && getClientFor(community.idTag, { explicit: true })
		if (!client) return
		setBusy(true)
		try {
			await fn(client)
			toast.success(t('Saved'))
			onDone()
		} catch (err) {
			console.error('Failed to update partner community', err)
			toast.error(t('Failed to save'))
		} finally {
			setBusy(false)
		}
	}

	async function revoke() {
		const ok = await dialog.confirm(
			t('Revoke all access'),
			t("{{name}}'s members will no longer be able to act here.", { name }),
			{ color: 'error', confirmLabel: t('Revoke') }
		)
		// '' is the "No access" preset; null stays "No access set" (undecided)
		if (ok) run((c) => c.profiles.adminUpdate(peer.idTag, { hatRoles: '' }))
	}

	async function disconnect() {
		const ok = await dialog.confirm(
			t('Disconnect'),
			t('Disconnect from {{name}}? Hats between the two communities stop working.', {
				name
			}),
			{ color: 'error', confirmLabel: t('Disconnect') }
		)
		if (ok) {
			run((c) => c.actions.create({ type: 'CONN', subType: 'DEL', audienceTag: peer.idTag }))
		}
	}

	return (
		<VBox gap={2}>
			<Heading level={4}>{t("Their members' access here")}</Heading>
			<Text as="p" emphasis="muted">
				{t(
					'Members of {{name}} can act in this community with a role you choose. Their role there decides which role they get here.',
					{ name }
				)}
			</Text>
			<AccessPresetPicker value={map} onChange={setMap} />
			<ActionBar>
				<Button disabled={busy} onClick={disconnect}>
					{t('Disconnect')}
				</Button>
				<Button
					disabled={busy}
					disabledReason={
						peer.hatRoles == null ? t('No access has been granted yet') : undefined
					}
					onClick={revoke}
				>
					{t('Revoke all access')}
				</Button>
				<Button
					color="primary"
					disabled={busy || !changed}
					onClick={() =>
						run((c) =>
							c.profiles.adminUpdate(peer.idTag, {
								hatRoles: formatHatRoles(parseHatRoles(map))
							})
						)
					}
				>
					{t('Save')}
				</Button>
			</ActionBar>
		</VBox>
	)
}

// vim: ts=4
