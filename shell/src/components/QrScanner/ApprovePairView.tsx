// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { DEFAULT_UPLOAD_PROFILE, type PairDetailsResult, type PorchEntry } from '@cloudillo/core'
import {
	Alert,
	Button,
	Card,
	Disclosure,
	EmptyState,
	Field,
	HBox,
	IcSuccess,
	Input,
	List,
	ListItem,
	LoadingSpinner,
	NativeSelect,
	ProfilePicture,
	Segmented,
	SegmentedItem,
	Text,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { lastFilesUrlAtom, roomLabel } from '../../apps/files/atoms.js'
import { activeContextAtom, communitiesAtom } from '../../context/atoms.js'
import { useContextAwareApi } from '../../context/context-aware-api.js'
import { useCtx } from '../../context/index.js'
import { IcDevice, IcReject } from '../../icons.js'
import { filesPath, switchPath } from '../../routes.js'
import { profileLabel, UPLOAD_PROFILES, type UploadProfile } from '../../upload-profiles.js'
import { useDocumentPicker } from '../DocumentPicker/useDocumentPicker.js'
import { browserName } from './state.js'

interface ApprovePairViewProps {
	sessionId: string
	/** From the scanned QR; absent on the link path, where the user must type it */
	code?: string
	onDone: () => void
}

type ViewState = 'loading' | 'confirm' | 'responding' | 'success' | 'error'

/** Lifetime select value → lifetimeSecs (null = no expiry) */
const LIFETIMES = [
	{ value: '3600', secs: 3600 },
	{ value: '28800', secs: 28800 },
	{ value: 'permanent', secs: null }
] as const
type Lifetime = (typeof LIFETIMES)[number]['value']

/** Switches rather than a lookup table so `pnpm run l-scan` sees every literal key. */
function lifetimeOption(t: (key: string) => string, v: Lifetime): string {
	switch (v) {
		case '3600':
			return t('1 hour')
		case '28800':
			return t('8 hours')
		case 'permanent':
			return t('Permanent')
	}
}

function lifetimeSummary(t: (key: string) => string, v: Lifetime): string {
	switch (v) {
		case '3600':
			return t('for 1 hour')
		case '28800':
			return t('for 8 hours')
		case 'permanent':
			return t('with no expiry')
	}
}

export function ApprovePairView({ sessionId, code, onDone }: ApprovePairViewProps) {
	const { t } = useTranslation()
	// The key is minted on the personal tenant; a community scope is delegated through an
	// rfile: grant, so details/respond stay personal and only the room list follows the context
	const { api } = useApi()
	const { api: ctxApi } = useContextAwareApi()
	const active = useAtomValue(activeContextAtom)
	const lastFiles = useAtomValue(lastFilesUrlAtom)
	const filesBase = filesPath(useCtx().base)
	const [auth] = useAuth()
	const ownIdTag = auth?.idTag
	const communities = useAtomValue(communitiesAtom)
	const navigate = useNavigate()
	const location = useLocation()
	const { pickDocument } = useDocumentPicker()

	const [state, setState] = React.useState<ViewState>('loading')
	const [details, setDetails] = React.useState<PairDetailsResult>()
	// A flag, translated at render time so fetchDetails needn't depend on t
	const [error, setError] = React.useState<'expired' | 'respond' | undefined>()
	const [rooms, setRooms] = React.useState<PorchEntry[]>([])
	const [target, setTarget] = React.useState('*')
	const [pickedFolder, setPickedFolder] = React.useState<{ id: string; name: string }>()
	const [access, setAccess] = React.useState<'R' | 'W'>('R')
	const [lifetime, setLifetime] = React.useState<Lifetime>(LIFETIMES[0].value)
	const [profile, setProfile] = React.useState<UploadProfile>(DEFAULT_UPLOAD_PROFILE)
	const [typedCode, setTypedCode] = React.useState('')
	const [choosingContext, setChoosingContext] = React.useState(false)
	const codeValid = !!code || /^\d{6}$/.test(typedCode)
	// Read through a ref so a new api identity mid-flow doesn't refetch and reset confirm state
	const apiRef = React.useRef(api)
	apiRef.current = api
	const doneTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	const alive = React.useRef(true)
	React.useEffect(() => {
		alive.current = true
		return () => {
			alive.current = false
			clearTimeout(doneTimer.current)
		}
	}, [])

	// a hatted community context still pairs as the plain community idTag
	const contextIdTag = active?.type === 'community' ? active.idTag : undefined
	const contextName = active?.name ?? ''
	const selectedIdTag = contextIdTag ?? ownIdTag
	const contexts = ownIdTag
		? [
				{ idTag: ownIdTag, name: auth?.name ?? ownIdTag, profilePic: auth?.profilePic },
				...communities.map((c) => ({
					idTag: c.idTag,
					name: c.name,
					profilePic: c.profilePic
				}))
			]
		: []
	const selected = contexts.find((c) => c.idTag === selectedIdTag) ?? contexts[0]

	// The open Files folder of this context, if any (remote shares are another tenant's entries)
	const search = new URLSearchParams(lastFiles.search)
	const currentFolder =
		lastFiles.pathname === filesBase && !search.get('remoteOwner')
			? search.get('parentId')
			: null

	React.useEffect(
		function fetchDetails() {
			const api = apiRef.current
			if (!api) return
			let cancelled = false
			setState('loading')
			;(async () => {
				try {
					const d = await api.auth.getPairDetails(sessionId)
					if (!cancelled) {
						setDetails(d)
						setState('confirm')
					}
				} catch (err) {
					console.error('Failed to fetch pairing details:', err)
					if (!cancelled) {
						setError('expired')
						setState('error')
					}
				}
			})()
			return () => {
				cancelled = true
			}
		},
		// !!api: the null → ready transition still triggers the first fetch
		[sessionId, !!api]
	)

	React.useEffect(
		function fetchRooms() {
			if (!ctxApi) return
			let cancelled = false
			ctxApi.channels
				.list()
				.then((list) => {
					if (!cancelled) setRooms(list.filter((r) => r.status === 'in'))
				})
				.catch((err) => console.error('Failed to list rooms:', err))
			return () => {
				cancelled = true
			}
		},
		[ctxApi]
	)

	// A remembered scope that vanished from the options (room left, folder closed) falls back
	const targetOptions = [
		'*',
		'__root__',
		...rooms.map((r) => `~${r.name}`),
		...(currentFolder ? [currentFolder] : []),
		...(pickedFolder ? [pickedFolder.id] : [])
	]
	const effectiveTarget = targetOptions.includes(target) ? target : '*'
	const effectiveRoom = rooms.find((r) => `~${r.name}` === effectiveTarget)
	const scopeLabel =
		effectiveTarget === '*'
			? t('Whole context')
			: effectiveTarget === '__root__'
				? roomLabel(null, contextName)
				: effectiveRoom
					? roomLabel(effectiveRoom.name, contextName, effectiveRoom.title ?? undefined)
					: effectiveTarget === pickedFolder?.id
						? pickedFolder.name
						: t('Current folder')
	const permanent = lifetime === 'permanent'
	const risky =
		(access === 'W' && (permanent || effectiveTarget === '*')) ||
		(permanent && effectiveTarget === '*')
	const summary = t('This key will grant {{access}} access to {{scope}}, {{lifetime}}.', {
		access: access === 'W' ? t('read and write') : t('read-only'),
		scope: scopeLabel,
		lifetime: lifetimeSummary(t, lifetime)
	})

	// Re-homes the page through the normal context switch (token, room list follow). The
	// state marks it user-chosen, so PairPage keeps it — a link cannot carry history state.
	function switchContext(idTag: string) {
		setTarget('*')
		setPickedFolder(undefined)
		navigate(
			switchPath(location.pathname, idTag, ownIdTag, () => false),
			{
				replace: true,
				state: { pairContext: true }
			}
		)
	}

	async function pickFolder() {
		const res = await pickDocument({
			folderOnly: true,
			title: t('Choose folder'),
			idTag: contextIdTag
		})
		if (!res || !alive.current) return
		if (res.fileId !== '__root__') setPickedFolder({ id: res.fileId, name: res.fileName })
		setTarget(res.fileId)
	}

	async function handleRespond(approved: boolean) {
		if (!api) return
		setState('responding')
		try {
			await api.auth.respondPair(
				sessionId,
				approved
					? {
							approved,
							target: effectiveTarget,
							access,
							contextIdTag,
							lifetimeSecs: LIFETIMES.find((l) => l.value === lifetime)?.secs ?? null,
							profile,
							code: code ?? typedCode
						}
					: { approved }
			)
			if (!alive.current) return
			if (approved) {
				setState('success')
				doneTimer.current = setTimeout(onDone, 1500)
			} else {
				onDone()
			}
		} catch (err) {
			if (!alive.current) return
			console.error('Pairing respond failed:', err)
			setError('respond')
			setState('error')
		}
	}

	return (
		<>
			{(state === 'loading' || state === 'responding') && <LoadingSpinner inverse />}

			{state === 'confirm' && (
				<Card
					className="w-100"
					style={{ maxWidth: '28rem', maxHeight: '100%', gap: 'var(--space-3)' }}
				>
					<HBox gap={3} align="center">
						<IcDevice size="2.5rem" className="flex-shrink-0" />
						<VBox gap={0}>
							<Text size="sm" emphasis="muted">
								{t('Pair this device?')}
							</Text>
							<Text size="lg" weight="semibold">
								{details?.deviceName}
							</Text>
							<Text size="sm" emphasis="muted" title={details?.userAgent}>
								{[browserName(t, details?.userAgent), details?.ipAddress]
									.filter(Boolean)
									.join(' · ')}
							</Text>
						</VBox>
					</HBox>
					<Alert color="warning" compact>
						{t(
							'Only approve a device you are setting up right now. The device name is reported by the device itself.'
						)}
					</Alert>
					{/* Content height, shrinking to scroll only once the card hits its max */}
					<VBox scroll gap={3} style={{ flex: '1 1 auto', minHeight: 0 }}>
						{!code && (
							<Field
								label={t('Verification code')}
								hint={t(
									'Type the code shown on the device you are setting up. Never enter a code someone sent you.'
								)}
							>
								<Input
									value={typedCode}
									onChange={(e) =>
										setTypedCode(e.target.value.replace(/\D/g, '').slice(0, 6))
									}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && codeValid) handleRespond(true)
									}}
									inputMode="numeric"
									autoComplete="one-time-code"
									autoFocus
									placeholder="000000"
									style={{
										textAlign: 'center',
										fontSize: '1.5rem',
										letterSpacing: '0.3em',
										fontVariantNumeric: 'tabular-nums'
									}}
								/>
							</Field>
						)}
						{communities.length > 0 && selected && (
							<Field label={t('Account')}>
								<List>
									{choosingContext ? (
										contexts.map((c) => (
											<ListItem
												key={c.idTag}
												leading={
													<ProfilePicture profile={c} srcTag={c.idTag} />
												}
												title={c.name}
												subtitle={`@${c.idTag}`}
												selected={c.idTag === selectedIdTag}
												onClick={() => {
													setChoosingContext(false)
													if (c.idTag !== selectedIdTag)
														switchContext(c.idTag)
												}}
											/>
										))
									) : (
										<ListItem
											leading={
												<ProfilePicture
													profile={selected}
													srcTag={selected.idTag}
												/>
											}
											title={selected.name}
											subtitle={`@${selected.idTag}`}
											trailing={
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setChoosingContext(true)}
												>
													{t('Change')}
												</Button>
											}
										/>
									)}
								</List>
							</Field>
						)}
						<Field
							label={t('Access to')}
							hint={
								contextIdTag
									? t('The key will give access to this community on your behalf')
									: undefined
							}
						>
							<NativeSelect
								value={effectiveTarget}
								onChange={(e) => {
									if (e.target.value === '__pick__') pickFolder()
									else setTarget(e.target.value)
								}}
							>
								<option value="*">{t('Whole context')}</option>
								<option value="__root__">{roomLabel(null, contextName)}</option>
								{rooms.map((r) => (
									<option key={r.name} value={`~${r.name}`}>
										{roomLabel(r.name, contextName, r.title ?? undefined)}
									</option>
								))}
								{currentFolder && currentFolder !== pickedFolder?.id && (
									<option value={currentFolder}>{t('Current folder')}</option>
								)}
								{pickedFolder && (
									<option value={pickedFolder.id}>{pickedFolder.name}</option>
								)}
								<option value="__pick__">{t('Choose folder…')}</option>
							</NativeSelect>
						</Field>
						<Field label={t('Permission')}>
							<Segmented
								fill
								aria-label={t('Permission')}
								value={access}
								onChange={(v) => setAccess(v as 'R' | 'W')}
							>
								<SegmentedItem value="R">{t('Read only')}</SegmentedItem>
								<SegmentedItem value="W">{t('Read and write')}</SegmentedItem>
							</Segmented>
						</Field>
						<Field label={t('Expires')}>
							<Segmented
								fill
								aria-label={t('Expires')}
								value={lifetime}
								onChange={(v) => setLifetime(v as Lifetime)}
							>
								{LIFETIMES.map((l) => (
									<SegmentedItem key={l.value} value={l.value}>
										{lifetimeOption(t, l.value)}
									</SegmentedItem>
								))}
							</Segmented>
						</Field>
						<Disclosure summary={t('More options')}>
							<Field label={t('Upload quality')}>
								<NativeSelect
									value={profile}
									onChange={(e) => setProfile(e.target.value as UploadProfile)}
								>
									{UPLOAD_PROFILES.map((p) => (
										<option key={p} value={p}>
											{profileLabel(t, p)}
										</option>
									))}
								</NativeSelect>
							</Field>
						</Disclosure>
					</VBox>
					<VBox
						gap={2}
						style={{
							borderTop: '1px solid var(--col-outline)',
							paddingTop: 'var(--space-3)'
						}}
					>
						{risky ? (
							<Alert color="warning" compact>
								<Text as="p">{summary}</Text>
								<Text as="p">
									{t(
										'Broad or long-lived access is risky. Grant only what this device needs.'
									)}
								</Text>
							</Alert>
						) : (
							<Text size="sm" emphasis="muted">
								{summary}
							</Text>
						)}
						{!codeValid && (
							<Text size="sm" emphasis="muted" align="right">
								{t('Enter the 6-digit code to allow')}
							</Text>
						)}
						<HBox gap={2} justify="end" wrap>
							<Button
								size="lg"
								icon={<IcReject />}
								onClick={() => handleRespond(false)}
							>
								{t('Deny')}
							</Button>
							<Button
								size="lg"
								color="primary"
								icon={<IcSuccess />}
								disabled={!codeValid}
								onClick={() => handleRespond(true)}
							>
								{t('Allow')}
							</Button>
						</HBox>
					</VBox>
				</Card>
			)}

			{state === 'success' && (
				<EmptyState
					inverse
					color="success"
					icon={<IcSuccess />}
					title={t('Device paired')}
				/>
			)}

			{state === 'error' && (
				<EmptyState
					inverse
					color="error"
					icon={<IcReject />}
					title={
						error === 'respond'
							? t('Failed to respond')
							: t('Session expired or invalid')
					}
					description={
						error === 'respond' ? (
							<Text>
								{t(
									'The device may already be paired. Check your API keys in Settings.'
								)}
								{!code && ` ${t('Check the verification code.')}`}
							</Text>
						) : (
							<Text>{t('Start pairing again on the device.')}</Text>
						)
					}
					actions={
						<>
							<Button onClick={onDone}>{t('Close')}</Button>
							{error === 'respond' && (
								<Button
									color="primary"
									onClick={() => {
										setError(undefined)
										setState('confirm')
									}}
								>
									{t('Try again')}
								</Button>
							)}
						</>
					}
				/>
			)}
		</>
	)
}

// vim: ts=4
