// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type ApiClient, FetchError, type VersionPolicy, type VersionView } from '@cloudillo/core'
import {
	Button,
	HBox,
	IcDownload,
	IcMore,
	IcUpload,
	Menu,
	MenuItem,
	Panel,
	Text,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcNamedVersion } from '../../../icons.js'
import { formatBytes } from '../../../utils.js'
import { triggerFileDownload } from '../../viewer/MediaViewer.js'
import { mergeFileView } from '../file-view.js'
import { type File, type FileOps, isFileProcessing } from '../types.js'
import {
	formatVersionFullTime,
	formatVersionTime,
	needsSeconds,
	versionCopyParts
} from '../version-format.js'

const PAGE_ROWS = 20

/** When the row's content was saved; pre-existing rows only know when it was replaced, and a
 *  legacy current row knows neither (`fallback`: the entry's creation time) */
function rowTime(v: VersionView, fallback: string): string {
	return v.savedAt ?? v.replacedAt ?? fallback
}

interface VersionsPanelProps {
	file: File
	fileOps: FileOps
	/** The owner-node client from DetailsPanel's `useFileOwnerScope` */
	api: ApiClient
}

export function VersionsPanel({ file, fileOps, api }: VersionsPanelProps) {
	const { t, i18n } = useTranslation()
	const toast = useToast()
	const dialog = useDialog()
	// The latest row, for merges that resolve later (the Undo toast outlives this render)
	const fileRef = React.useRef(file)
	fileRef.current = file
	// undefined = loading, null = load failed
	const [versions, setVersions] = React.useState<VersionView[] | null | undefined>(undefined)
	const [policy, setPolicy] = React.useState<VersionPolicy | undefined>(undefined)
	// The policy's 403 means a scoped caller, whom naming and deleting refuse too
	const [purgeDenied, setPurgeDenied] = React.useState(false)
	const [versionBusy, setVersionBusy] = React.useState<string | undefined>(undefined)
	// For the Undo toast, whose closure outlives this render
	const busyRef = React.useRef(versionBusy)
	busyRef.current = versionBusy
	const undoToastRef = React.useRef<string | undefined>(undefined)
	const [versionsReload, setVersionsReload] = React.useState(0)
	const [showAll, setShowAll] = React.useState(false)
	const reload = () => setVersionsReload((n) => n + 1)

	React.useEffect(
		function loadVersions() {
			// No reset to undefined: a reload keeps the old list until the new one arrives
			// (DetailsPanel keys this panel by file.id, so another file starts fresh)
			let cancelled = false
			api.files.versions(file.id, { current: true }).then(
				(list) => {
					if (!cancelled) setVersions(list)
				},
				(err) => {
					console.error('Failed to load versions', err)
					// A failed reload keeps the list it already has
					if (!cancelled) setVersions((prev) => prev ?? null)
				}
			)
			return () => {
				cancelled = true
			}
		},
		// contentId: a restore or replace changes it, and with it the history list.
		// versionsReload: bumped after a mutation, or a restore when there is no setFile.
		[api, file.id, file.contentId, versionsReload]
	)

	React.useEffect(
		function loadPolicy() {
			let cancelled = false
			api.files.versionPolicy(file.id).then(
				(p) => {
					if (!cancelled) setPolicy(p)
				},
				// The footer is extra information: no policy, no footer
				(err) => {
					if (cancelled) return
					setPolicy(undefined)
					setPurgeDenied(err instanceof FetchError && err.httpStatus === 403)
				}
			)
			return () => {
				cancelled = true
			}
		},
		[api, file.id]
	)

	// The Undo toast acts on this file: it goes when the panel does (another file selected)
	React.useEffect(
		() => () => {
			if (undoToastRef.current) toast.dismiss(undoToastRef.current)
		},
		[toast]
	)

	const now = new Date()
	const timeOf = (v: VersionView, withSeconds = false) =>
		formatVersionTime(rowTime(v, file.createdAt), now, i18n.language, t, withSeconds)
	const current = versions?.find((v) => v.current)

	/** Restore `fileId`; `expected` is the content we believe is current (If-Match) */
	async function doRestore(fileId: string, expected: string | undefined) {
		const restored = await api.files.restoreVersion(file.id, fileId, expected)
		// The list also re-fetches the row on the filesChanged that follows; merge here for
		// immediacy (and for the panel when the row is not in a list)
		if (fileOps.setFile) {
			fileOps.setFile(mergeFileView(fileRef.current, restored))
			// No contentId, no change to file.contentId: the list effect would not re-run
			if (restored.contentId == null) reload()
		} else reload()
		return restored
	}

	function restoreFailed(err: unknown) {
		if (err instanceof FetchError && err.httpStatus === 412) {
			reload()
			toast.error(t('The file changed while you were looking. The list is up to date now.'))
		} else {
			console.error('Failed to restore version', err)
			toast.error(t('Failed to restore version'))
		}
	}

	async function restoreVersion(v: VersionView) {
		// file.contentId covers a list that failed to load or a server that ignores `current`
		const previous = current?.fileId ?? file.contentId ?? undefined
		setVersionBusy(v.fileId)
		try {
			const restored = await doRestore(v.fileId, previous)
			// Restore swaps contents, so the entry now points at the restored content
			const nowCurrent = restored.contentId ?? v.fileId
			let toastId = ''
			async function undo() {
				if (!previous || busyRef.current || isFileProcessing(fileRef.current)) return
				toast.dismiss(toastId)
				undoToastRef.current = undefined
				setVersionBusy(previous)
				try {
					await doRestore(previous, nowCurrent)
					toast.success(t('Version restored'))
				} catch (err) {
					restoreFailed(err)
				} finally {
					setVersionBusy(undefined)
				}
			}
			// One Undo at a time: an earlier one would undo to a content that is no longer current
			if (undoToastRef.current) toast.dismiss(undoToastRef.current)
			// Persistent until dismissed (WCAG 2.2.1); Undo needs the replaced content id
			toastId = toast.success(t('Restored version from {{time}}', { time: timeOf(v) }), {
				duration: 0,
				dismissible: true,
				actions: previous ? (
					<Button size="sm" variant="ghost" onClick={undo}>
						{t('Undo')}
					</Button>
				) : undefined
			})
			undoToastRef.current = toastId
		} catch (err) {
			restoreFailed(err)
		} finally {
			setVersionBusy(undefined)
		}
	}

	async function restoreVersionAsCopy(v: VersionView) {
		const { stem, ext, date } = versionCopyParts(file.fileName, rowTime(v, file.createdAt))
		setVersionBusy(v.fileId)
		try {
			await api.files.duplicate(file.id, {
				fileName: t('{{stem}} (as of {{date}})', { stem, date }) + ext,
				parentId: file.parentId ?? undefined,
				fromVersion: v.fileId
			})
			// FileOps has no list refresh, so the copy shows on the next list reload.
			toast.success(t('Version restored as a copy'))
		} catch (err) {
			console.error('Failed to restore version as a copy', err)
			toast.error(t('Failed to restore version as a copy'))
		} finally {
			setVersionBusy(undefined)
		}
	}

	/** Runs a row mutation with the row busy (locks its ⋯ menu), then reloads the list */
	async function mutate(v: VersionView, failMsg: string, fn: () => Promise<unknown>) {
		setVersionBusy(v.fileId)
		try {
			await fn()
			reload()
		} catch (err) {
			console.error(failMsg, err)
			toast.error(failMsg)
		} finally {
			setVersionBusy(undefined)
		}
	}

	async function nameVersion(v: VersionView) {
		const input = await dialog.askText(
			v.name ? t('Rename version') : t('Name this version'),
			t('Named versions are never deleted automatically.'),
			{ defaultValue: v.name ?? undefined, confirmLabel: t('Save'), maxLength: 64 }
		)
		const name = input?.trim()
		if (!name || name === v.name) return
		await mutate(v, t('Failed to name version'), () =>
			api.files.nameVersion(file.id, v.fileId, name)
		)
	}

	async function removeName(v: VersionView) {
		const ok = await dialog.confirm(
			t('Remove name'),
			t('This version may be deleted at the next cleanup.'),
			{ confirmLabel: t('Remove name') }
		)
		if (!ok) return
		await mutate(v, t('Failed to remove name'), () =>
			api.files.nameVersion(file.id, v.fileId, '')
		)
	}

	async function deleteVersion(v: VersionView) {
		const ok = await dialog.confirm(
			t('Delete version'),
			t("Delete the version from {{time}}? This can't be undone.", { time: timeOf(v) }),
			{ confirmLabel: t('Delete version'), color: 'error' }
		)
		if (!ok) return
		await mutate(v, t('Failed to delete version'), () =>
			api.files.deleteVersion(file.id, v.fileId)
		)
	}

	const processing = isFileProcessing(file)

	function renderRow(v: VersionView, withSeconds: boolean) {
		const time = timeOf(v, withSeconds)
		const iso = rowTime(v, file.createdAt)
		const fullTime = formatVersionFullTime(iso, i18n.language)
		const author = v.savedBy ?? v.replacedBy
		const maxSizeMb = policy?.maxSizeMb
		const oversize =
			!!v.current &&
			maxSizeMb != null &&
			maxSizeMb > 0 &&
			v.size != null &&
			v.size > maxSizeMb * 2 ** 20
		const downloadLabel = t('Download version from {{time}}', { time })
		const moreLabel = t('More actions for version from {{time}}', { time })

		return (
			<HBox
				key={v.fileId}
				gap={1}
				align="center"
				className={v.name ? 'version-row named' : 'version-row'}
			>
				<VBox className="flex-fill w-min-0">
					{v.name && (
						<HBox gap={1} align="center">
							<IcNamedVersion aria-hidden />
							<Text size="sm" weight="bold" truncate>
								{v.name}
							</Text>
						</HBox>
					)}
					<Text size="sm">
						<time dateTime={iso} title={fullTime}>
							{time}
						</time>
						{v.current && ` · ${t('Current')}`}
					</Text>
					<Text size="sm" emphasis="muted" truncate>
						{[author, v.size != null && formatBytes(v.size)]
							.filter(Boolean)
							.join(' · ')}
					</Text>
					{oversize && (
						<Text size="sm" emphasis="muted">
							{t('Files over {{n}} MB keep earlier versions only when named', {
								n: maxSizeMb
							})}
						</Text>
					)}
				</VBox>
				{!v.current && (
					<Button
						size="sm"
						variant="ghost"
						icon={<IcDownload />}
						aria-label={downloadLabel}
						className="version-hit"
						onClick={() =>
							triggerFileDownload(
								api.idTag,
								v.fileId,
								file.fileName,
								() => toast.error(t('Download failed. Please try again.')),
								file.id
							)
						}
					/>
				)}
				{/* The current row has only naming; without it there is no menu */}
				{!(v.current && purgeDenied) && (
					<Menu
						trigger={
							<Button
								size="sm"
								variant="ghost"
								icon={<IcMore />}
								aria-label={moreLabel}
								className="version-hit"
								loading={versionBusy === v.fileId}
								disabled={!!versionBusy}
							/>
						}
					>
						{!purgeDenied &&
							(v.name ? (
								<>
									<MenuItem label={t('Rename…')} onClick={() => nameVersion(v)} />
									<MenuItem
										label={t('Remove name')}
										onClick={() => removeName(v)}
									/>
								</>
							) : (
								<MenuItem
									label={t('Name this version…')}
									onClick={() => nameVersion(v)}
								/>
							))}
						{/* The current content cannot be restored or deleted (409) */}
						{!v.current && (
							<>
								<MenuItem
									label={t('Restore')}
									disabled={processing}
									description={
										processing ? t('Wait until processing finishes') : undefined
									}
									onClick={() => restoreVersion(v)}
								/>
								<MenuItem
									label={t('Restore as copy')}
									onClick={() => restoreVersionAsCopy(v)}
								/>
								{!purgeDenied && (
									<MenuItem
										label={t('Delete version')}
										color="error"
										disabled={!!v.name}
										description={
											v.name ? t('Remove the name first') : undefined
										}
										onClick={() => deleteVersion(v)}
									/>
								)}
							</>
						)}
					</Menu>
				)}
			</HBox>
		)
	}

	let body: React.ReactNode
	if (versions === undefined) {
		body = (
			<Text size="sm" emphasis="muted">
				{t('Loading…')}
			</Text>
		)
	} else if (versions === null) {
		body = (
			<Text size="sm" emphasis="muted">
				{t('Could not load versions. Please try again.')}
			</Text>
		)
	} else {
		const rows = showAll ? versions : versions.slice(0, PAGE_ROWS)
		const seconds = needsSeconds(rows.map((r) => rowTime(r, file.createdAt)))
		body = (
			<VBox gap={2}>
				{rows.map((v, i) => renderRow(v, seconds[i]))}
				{!versions.some((v) => !v.current) && (
					<Text size="sm" emphasis="muted">
						{t(
							'No earlier versions yet. Upload a new version to keep this one in history.'
						)}
					</Text>
				)}
				{versions.length > rows.length && (
					<Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
						{t('Show all ({{n}})', { n: versions.length })}
					</Button>
				)}
				{policy && (
					<Text size="sm" emphasis="muted">
						{t(
							'Unnamed versions are kept for {{count}} days (up to {{max}}). Named versions are kept until you remove the name.',
							{
								count: policy.keepDays,
								max: policy.keepCount,
								defaultValue_one:
									'Unnamed versions are kept for {{count}} day (up to {{max}}). Named versions are kept until you remove the name.'
							}
						)}
					</Text>
				)}
			</VBox>
		)
	}

	const pickNewVersion = fileOps.pickNewVersion
	return (
		<Panel
			title={t('Versions')}
			headingLevel={3}
			actions={
				pickNewVersion && (
					<Button
						size="sm"
						icon={<IcUpload />}
						disabledReason={
							processing ? t('Wait until processing finishes') : undefined
						}
						// The file picker opens only inside the click's user activation
						immediate
						onClick={() => pickNewVersion(file)}
					>
						{t('Upload new version')}
					</Button>
				)
			}
		>
			{body}
		</Panel>
	)
}

// vim: ts=4
