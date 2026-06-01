// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useAtom } from 'jotai'

import {
	LuArrowLeft as IcBack,
	LuUpload as IcUpload,
	LuDownload as IcDownload,
	LuTrash2 as IcTrash,
	LuFolder as IcFolder,
	LuFileWarning as IcError
} from 'react-icons/lu'

import {
	Button,
	LoadingSpinner,
	DropZone,
	EmptyState,
	Progress,
	useDialog,
	useToast
} from '@cloudillo/react'
import { createApiClient, type FileView, getFileUrl } from '@cloudillo/core'

import type { AppConfigState } from '../../utils.js'
import { getFileIcon } from '../files/icons.js'
import { Breadcrumbs } from '../files/components/Breadcrumbs.js'
import type { BreadcrumbItem } from '../files/hooks/useFileNavigation.js'
import { BlobViewer, renderSharedApp } from './shared-app.js'
import { triggerDownload } from '../viewer/MediaViewer.js'
import { GuestNameDialog } from '../../components/GuestNameDialog.js'
import { getStoredGuestName } from '../../utils/random-name.js'
import { useInstalledToken } from './useInstalledToken.js'
import { sharedFolderCacheAtom, sharedCacheRefIdAtom, folderGuestNameAtom } from './atoms.js'

import './SharedFolderView.css'

interface UploadProgress {
	done: number
	total: number
}

// Decode a JWT's `exp` claim (seconds) to epoch ms. No signature check.
function jwtExpiryMs(token: string): number | null {
	try {
		const [, payload] = token.split('.')
		if (!payload) return null
		// JWT payloads are base64url (-/_ , no padding); normalize before atob.
		const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
		const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
		const decoded = JSON.parse(atob(padded))
		return decoded.exp ? decoded.exp * 1000 : null
	} catch {
		return null
	}
}

interface SharedFolderViewProps {
	/** The shared folder (the share root). */
	rootFile: FileView
	/** Scoped guest token (folder-scope). */
	token: string
	/** Owner identity tag. */
	idTag: string
	/** Access level granted by the share. */
	accessLevel: 'read' | 'comment' | 'write'
	/** Share link ref ID (for guest token refresh on opened documents). */
	refId?: string
	appConfig: AppConfigState | undefined
	guestName?: string
}

/**
 * SharedFolderView — a dedicated guest browser for a shared directory.
 *
 * Lists the folder's children (navigating subfolders, opening files in the
 * viewer or microfrontend app), all using the folder-scoped guest token. When
 * the share grants write access, guests can upload files directly into the
 * current folder.
 *
 * The backend extends the folder-scope token to every descendant (read) and,
 * for write shares, authorizes uploads into the subtree, so the same token
 * works for listing, opening, downloading, and uploading.
 */
export function SharedFolderView({
	rootFile,
	token,
	idTag,
	accessLevel,
	refId,
	appConfig,
	guestName
}: SharedFolderViewProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()

	// Refreshable copy of the share token (proactively renewed before expiry).
	const [scopedToken, setScopedToken] = React.useState(token)
	React.useEffect(() => {
		setScopedToken(token)
	}, [token])

	// Unscoped client only for the unauthenticated ref refresh endpoint.
	const refApi = React.useMemo(() => createApiClient({ idTag }), [idTag])

	// Scoped client follows the refreshable token.
	const scopedApi = React.useMemo(
		() => createApiClient({ idTag, authToken: scopedToken }),
		[idTag, scopedToken]
	)

	// Proactively refresh the scoped token at ~80% of its lifetime.
	React.useEffect(
		function refreshScopedToken() {
			if (!refId) return
			const exp = jwtExpiryMs(scopedToken)
			if (!exp) return
			const remaining = exp - Date.now()
			if (remaining <= 0) return
			// Refresh at ~80% of remaining lifetime, clamped to the max safe
			// setTimeout delay (delays > 2^31-1 ms overflow and fire immediately,
			// looping refreshes). For a token longer than ~31 days this refreshes
			// after ~24.8 days then reschedules — correct, no tight loop.
			const MAX_TIMEOUT = 2_147_483_647
			const delay = Math.min(remaining * 0.8, MAX_TIMEOUT)
			const id = setTimeout(async () => {
				try {
					const res = await refApi.auth.getAccessTokenByRef(refId, { refresh: true })
					setScopedToken(res.token)
				} catch (err) {
					console.error('[SharedFolderView] token refresh failed:', err)
				}
			}, delay)
			return () => clearTimeout(id)
		},
		[refId, scopedToken, refApi]
	)

	// Install the scoped token into the ServiceWorker so it attaches it as an
	// Authorization header on header-less media requests (img/video/anchor) to
	// the owner's node — keeping the token out of URLs (?token=). `tokenReady`
	// gates token-less thumbnail rendering until the SW holds the token, so an
	// <img> never fires before the install resolves (first-paint race).
	const { ready: tokenReady, useUrlToken } = useInstalledToken(scopedToken)
	// When the SW install fails the SW can't inject the Authorization header, so
	// fall back to embedding the token in media URLs (?token=) instead of 401-ing.
	const thumbTokenParam = useUrlToken ? scopedToken : undefined

	// Read the scoped client through a ref so token refresh doesn't retrigger
	// the data effects (which would wipe the grid to a spinner).
	const scopedApiRef = React.useRef(scopedApi)
	React.useEffect(() => {
		scopedApiRef.current = scopedApi
	}, [scopedApi])

	// Folder + opened-file navigation lives in the URL (mirrors the Files app),
	// so browser back/forward and deep links work. The refId only identifies the
	// share; ?parentId= is the current folder, ?file= an opened child.
	const [searchParams, setSearchParams] = useSearchParams()
	const currentFolderId = searchParams.get('parentId') || rootFile.fileId
	const openFileId = searchParams.get('file')

	const [children, setChildren] = React.useState<FileView[]>([])
	const [breadcrumbs, setBreadcrumbs] = React.useState<BreadcrumbItem[]>([])
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState(false)
	const [uploadProgress, setUploadProgress] = React.useState<UploadProgress | null>(null)
	const [refreshKey, setRefreshKey] = React.useState(0)
	// Metadata for a deep-linked ?file= that isn't in the current children
	// (stale link, or parentId omitted) — fetched directly so it still opens.
	const [fetchedOpenFile, setFetchedOpenFile] = React.useState<FileView | null>(null)

	// Guests browsing a folder share never hit the top-level name prompt, so
	// seed from the prop / stored name and prompt lazily when they open a
	// collaborative doc (see handleOpen + pendingAppFile dialog below). Held in
	// a global atom so it survives remounts.
	const [folderGuestName, setFolderGuestName] = useAtom(folderGuestNameAtom)
	const [pendingAppFile, setPendingAppFile] = React.useState<FileView | null>(null)

	// Per-folder listing cache (global atom) keyed by `${refId}:${folderId}`, so
	// already-seen folders show cached content instantly instead of a spinner.
	const [cache, setCache] = useAtom(sharedFolderCacheAtom)
	const [cacheRefId, setCacheRefId] = useAtom(sharedCacheRefIdAtom)
	const cacheKey = `${refId ?? ''}:${currentFolderId}`

	// Read cache through a ref so cache writes never retrigger the data effects.
	const cacheRef = React.useRef(cache)
	React.useEffect(() => {
		cacheRef.current = cache
	}, [cache])

	// Seed the guest name once when empty (atoms have no per-mount lazy init).
	React.useEffect(() => {
		if (folderGuestName === undefined) {
			const seed = guestName ?? getStoredGuestName() ?? undefined
			if (seed) setFolderGuestName(seed)
		}
	}, [folderGuestName, guestName, setFolderGuestName])

	// Wipe the cache when a different share is opened, so the first folder of the
	// new share shows a spinner and never another share's data.
	React.useEffect(
		function resetCacheOnShareSwitch() {
			if (cacheRefId !== (refId ?? null)) {
				setCache({})
				setCacheRefId(refId ?? null)
			}
		},
		[refId, cacheRefId, setCache, setCacheRefId]
	)

	const canWrite = accessLevel === 'write'
	const uploading = uploadProgress !== null

	// Load the current folder's children: show cached content immediately (no
	// spinner) when seen before, then always revalidate and rewrite the cache.
	React.useEffect(
		function loadChildren() {
			let cancelled = false
			const seeded = cacheRef.current[cacheKey]
			if (seeded) {
				setChildren(seeded.children)
				setLoading(false)
				setError(false)
			} else {
				setLoading(true)
				setError(false)
			}

			;(async function () {
				try {
					const files = await scopedApiRef.current.files.list({
						parentId: currentFolderId,
						sort: 'name',
						sortDir: 'asc'
					})
					if (cancelled) return
					// Folder-first: the server sorts by name only, so re-order
					// here to match the Files app (folders before files).
					const sorted = [...files].sort((a, b) => {
						const aFolder = (a.fileTp || 'BLOB') === 'FLDR'
						const bFolder = (b.fileTp || 'BLOB') === 'FLDR'
						if (aFolder !== bFolder) return aFolder ? -1 : 1
						return a.fileName.localeCompare(b.fileName)
					})
					setChildren(sorted)
					setCache((c) => ({
						...c,
						[cacheKey]: {
							children: sorted,
							breadcrumbs: c[cacheKey]?.breadcrumbs ?? []
						}
					}))
				} catch (err) {
					if (cancelled) return
					console.error('[SharedFolderView] Failed to list folder:', err)
					// Keep stale cached content if we have any; only error on first visit.
					if (!cacheRef.current[cacheKey]) setError(true)
				} finally {
					if (!cancelled) setLoading(false)
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[currentFolderId, refreshKey]
	)

	// Build breadcrumbs from the share root to the current folder in one request.
	React.useEffect(
		function buildBreadcrumbs() {
			let cancelled = false
			setBreadcrumbs(cacheRef.current[cacheKey]?.breadcrumbs ?? [])

			;(async function () {
				try {
					const result = await scopedApiRef.current.files.list({
						fileId: currentFolderId,
						withPath: true
					})
					if (cancelled) return
					const current = result[0]
					if (!current) {
						setBreadcrumbs([])
						return
					}
					const chain: BreadcrumbItem[] = [
						...(current.path ?? []).map((p) => ({ id: p.id, name: p.name })),
						{ id: current.fileId, name: current.fileName }
					]
					// Trim to the share root so ancestors above it are never shown.
					const rootIdx = chain.findIndex((c) => c.id === rootFile.fileId)
					const trimmed = rootIdx >= 0 ? chain.slice(rootIdx) : chain
					if (cancelled) return
					setBreadcrumbs(trimmed)
					setCache((c) => ({
						...c,
						[cacheKey]: {
							children: c[cacheKey]?.children ?? [],
							breadcrumbs: trimmed
						}
					}))
				} catch {
					if (!cancelled) setBreadcrumbs([])
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[currentFolderId, rootFile.fileId]
	)

	// Deep-link fallback: when ?file= points at a file not in the current
	// children (e.g. it lives in a different folder than ?parentId), fetch its
	// metadata directly so it still opens instead of silently showing the list.
	// Depend on a boolean membership rather than the `children` array (whose
	// identity changes on every revalidation) so an out-of-folder ?file= isn't
	// re-fetched on every background refresh.
	const openInChildren = !!openFileId && children.some((f) => f.fileId === openFileId)

	React.useEffect(
		function fetchDeepLinkedFile() {
			let cancelled = false
			if (!openFileId || openInChildren) {
				setFetchedOpenFile(null)
				return
			}
			;(async function () {
				try {
					const result = await scopedApiRef.current.files.list({ fileId: openFileId })
					if (cancelled) return
					setFetchedOpenFile(result[0] ?? null)
				} catch (err) {
					if (cancelled) return
					console.error('[SharedFolderView] Failed to load deep-linked file:', err)
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[openFileId, openInChildren]
	)

	// URL navigation helpers (react-router-dom 7 functional updater preserves
	// unrelated params).
	const navigateToFolder = React.useCallback(
		(folderId: string | null) => {
			setSearchParams((prev) => {
				const p = new URLSearchParams(prev)
				p.delete('file')
				if (folderId && folderId !== rootFile.fileId) p.set('parentId', folderId)
				else p.delete('parentId')
				return p
			})
		},
		[setSearchParams, rootFile.fileId]
	)

	const openFileInUrl = React.useCallback(
		(fileId: string) => {
			setSearchParams((prev) => {
				const p = new URLSearchParams(prev)
				p.set('file', fileId)
				return p
			})
		},
		[setSearchParams]
	)

	const closeFileInUrl = React.useCallback(() => {
		setSearchParams((prev) => {
			const p = new URLSearchParams(prev)
			p.delete('file')
			return p
		})
	}, [setSearchParams])

	async function handleUpload(files: File[]) {
		if (!canWrite || files.length === 0) return
		setUploadProgress({ done: 0, total: files.length })
		const failed: string[] = []
		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i]
				try {
					await scopedApi.files.uploadBlob('file', file.name, file, file.type, {
						parentId: currentFolderId
					})
				} catch (err) {
					failed.push(file.name)
					console.error('[SharedFolderView] Upload failed:', err)
				}
				setUploadProgress({ done: i + 1, total: files.length })
			}
		} finally {
			setRefreshKey((k) => k + 1)
			setUploadProgress(null)
		}
		const succeeded = files.length - failed.length
		if (succeeded > 0) {
			toast.success(t('Uploaded {{count}} file', { count: succeeded }))
		}
		if (failed.length > 0) {
			toast.error(t('Failed to upload {{names}}', { names: failed.join(', ') }))
		}
	}

	function handleDownload(file: FileView) {
		// No ?token= — the SW injects the installed scoped token as an
		// Authorization header on this header-less anchor-download GET.
		triggerDownload(getFileUrl(idTag, file.fileId), file.fileName)
	}

	async function handleDelete(file: FileView) {
		if (!canWrite) return
		const isFolder = (file.fileTp || 'BLOB') === 'FLDR'
		const ok = await dialog.confirm(
			isFolder ? t('Move folder to trash') : t('Move to trash'),
			isFolder
				? t('Are you sure you want to move this folder and its contents to trash?')
				: t('Are you sure you want to move "{{name}}" to trash?', { name: file.fileName })
		)
		if (!ok) return
		try {
			await scopedApi.files.delete(file.fileId)
			setRefreshKey((k) => k + 1)
		} catch (err) {
			console.error('[SharedFolderView] Delete failed:', err)
			toast.error(t('Failed to delete "{{name}}"', { name: file.fileName }))
		}
	}

	function handleOpen(file: FileView) {
		const fileTp = file.fileTp || 'BLOB'
		if (fileTp === 'FLDR') {
			navigateToFolder(file.fileId)
			return
		}
		// Collaborative docs need a guest name for awareness; prompt lazily if
		// we don't have one yet (folder shares skip the top-level prompt).
		if ((fileTp === 'CRDT' || fileTp === 'RTDB') && !folderGuestName) {
			setPendingAppFile(file)
			return
		}
		openFileInUrl(file.fileId)
	}

	// A collaborative doc was opened before we had a guest name — prompt, then
	// open it once a name is confirmed.
	if (pendingAppFile) {
		return (
			<GuestNameDialog
				open
				onConfirm={(name) => {
					setFolderGuestName(name)
					openFileInUrl(pendingAppFile.fileId)
					setPendingAppFile(null)
				}}
				onCancel={() => setPendingAppFile(null)}
			/>
		)
	}

	// The opened child file is derived from the URL once children are loaded.
	const openFile = openFileId
		? (children.find((f) => f.fileId === openFileId) ?? fetchedOpenFile)
		: null

	// Opened a child file: render the viewer / app with a back action to the listing.
	if (openFile) {
		const fileTp = openFile.fileTp || 'BLOB'
		if (fileTp === 'CRDT' || fileTp === 'RTDB') {
			const appEl = renderSharedApp(openFile, {
				token: scopedToken,
				idTag,
				access: accessLevel,
				refId,
				appConfig,
				guestName: folderGuestName
			})
			return (
				<div className="c-vbox flex-fill h-100">
					<div className="c-hbox g-2 p-2 align-items-center">
						<Button
							mode="icon"
							onClick={() => closeFileInUrl()}
							title={t('Back')}
							aria-label={t('Back')}
						>
							<IcBack />
						</Button>
						<span className="text-secondary">{openFile.fileName}</span>
					</div>
					<div className="flex-fill" style={{ minHeight: 0 }}>
						{appEl ?? (
							<div className="c-panel flex-fill d-flex flex-column align-items-center justify-content-center g-2">
								<IcError size="4rem" className="text-warning" />
								<h2>{t('Unsupported file type')}</h2>
								<p className="text-secondary">{openFile.contentType}</p>
							</div>
						)}
					</div>
				</div>
			)
		}
		// BLOB: inline viewer (image/video/PDF/download), back returns to listing
		return (
			<BlobViewer
				file={openFile}
				token={scopedToken}
				idTag={idTag}
				onBack={() => closeFileInUrl()}
			/>
		)
	}

	// Map the share-root→current chain to the Files app's Breadcrumbs shape,
	// marking the first crumb as the share root so the guest sees the share
	// icon, owner attribution, and access badge.
	const ownerName = rootFile.owner?.name || idTag
	const crumbItems: BreadcrumbItem[] = breadcrumbs.map((crumb, idx) => ({
		id: crumb.id,
		name: crumb.name,
		isShareRoot: idx === 0,
		ownerName: idx === 0 ? ownerName : undefined
	}))

	return (
		<DropZone
			className="c-panel flex-fill c-vbox g-2 p-2 h-100"
			onFilesDropped={handleUpload}
			disabled={!canWrite || uploading}
			overlay
		>
			{/* Breadcrumbs + actions */}
			<div className="c-hbox g-1 align-items-center">
				<Breadcrumbs
					className="flex-fill"
					items={crumbItems}
					onNavigate={(id) => navigateToFolder(id)}
					isRemoteBrowsing
					accessLevel={canWrite ? 'write' : 'read'}
				/>
				{canWrite && (
					<UploadButton onFiles={handleUpload} disabled={uploading} label={t('Upload')} />
				)}
			</div>

			{uploadProgress && (
				<div className="c-vbox g-1">
					<span className="text-secondary">
						{t('Uploading {{completed}} of {{total}}', {
							completed: uploadProgress.done,
							total: uploadProgress.total
						})}
					</span>
					<Progress
						variant="primary"
						value={
							uploadProgress.total
								? (uploadProgress.done / uploadProgress.total) * 100
								: 0
						}
					/>
				</div>
			)}

			{error ? (
				<EmptyState
					className="flex-fill"
					icon={<IcError size="3rem" className="text-error" />}
					title={t('Could not load this folder')}
					description={t('Failed to load folder contents')}
					action={
						<Button variant="primary" onClick={() => setRefreshKey((k) => k + 1)}>
							{t('Retry')}
						</Button>
					}
				/>
			) : loading ? (
				<div className="flex-fill d-flex align-items-center justify-content-center">
					<LoadingSpinner size="lg" label={t('Loading folder…')} />
				</div>
			) : children.length === 0 ? (
				<EmptyState
					className="flex-fill"
					icon={<IcFolder size="3rem" className="text-secondary" />}
					title={t('This folder is empty')}
					description={
						canWrite ? t('Drop files here or click Upload to add them') : undefined
					}
					action={
						canWrite ? (
							<UploadButton
								onFiles={handleUpload}
								disabled={uploading}
								label={t('Upload')}
							/>
						) : undefined
					}
				/>
			) : (
				<div className="g-2 c-shared-folder-grid">
					{children.map((file) => (
						<FolderItem
							key={file.fileId}
							file={file}
							idTag={idTag}
							canWrite={canWrite}
							tokenReady={tokenReady}
							tokenUrl={thumbTokenParam}
							onOpen={() => handleOpen(file)}
							onDownload={() => handleDownload(file)}
							onDelete={() => handleDelete(file)}
						/>
					))}
				</div>
			)}
		</DropZone>
	)
}

interface FolderItemProps {
	file: FileView
	idTag: string
	canWrite: boolean
	tokenReady: boolean
	/** Fallback token to embed in the thumbnail URL when SW header injection is unavailable. */
	tokenUrl?: string
	onOpen: () => void
	onDownload: () => void
	onDelete: () => void
}

function FolderItem({
	file,
	idTag,
	canWrite,
	tokenReady,
	tokenUrl,
	onOpen,
	onDownload,
	onDelete
}: FolderItemProps) {
	const { t } = useTranslation()
	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isImage = file.contentType.startsWith('image/')
	const fileTp = file.fileTp || 'BLOB'
	const isBlob = fileTp === 'BLOB'
	// Normally no ?token= — the SW injects the installed scoped token on this img
	// GET. Only build the URL once the SW holds the token, so the <img> never
	// fires before the install resolves (first-paint race). When the SW install
	// failed (tokenUrl set), embed the token in the URL so the thumbnail loads.
	const thumbUrl =
		isImage && tokenReady
			? getFileUrl(idTag, file.fileId, 'vis.tn', tokenUrl ? { token: tokenUrl } : undefined)
			: undefined

	return (
		<div
			className="c-card c-shared-folder-item"
			style={{ position: 'relative' }}
			title={file.fileName}
		>
			<div
				className="c-shared-folder-actions c-hbox g-2 pos-absolute top-0 right-0 p-1"
				style={{ zIndex: 1 }}
			>
				{isBlob && (
					<Button
						mode="icon"
						title={t('Download')}
						aria-label={t('Download {{name}}', { name: file.fileName })}
						onClick={() => onDownload()}
					>
						<IcDownload />
					</Button>
				)}
				{canWrite && (
					<Button
						mode="icon"
						variant="error"
						title={t('Delete')}
						aria-label={t('Delete {{name}}', { name: file.fileName })}
						onClick={() => onDelete()}
					>
						<IcTrash />
					</Button>
				)}
			</div>
			<button
				type="button"
				className="c-shared-folder-item__open c-vbox g-1 p-2 align-items-center w-100"
				onClick={onOpen}
			>
				<div
					className="d-flex align-items-center justify-content-center"
					style={{ width: '100%', height: '5rem' }}
				>
					{thumbUrl ? (
						<img className="c-shared-folder-thumb" src={thumbUrl} alt={file.fileName} />
					) : (
						<Icon width="3rem" height="3rem" />
					)}
				</div>
				<span className="text-center c-shared-folder-name">{file.fileName}</span>
			</button>
		</div>
	)
}

interface UploadButtonProps {
	onFiles: (files: File[]) => void
	disabled?: boolean
	label: string
}

function UploadButton({ onFiles, disabled, label }: UploadButtonProps) {
	const inputRef = React.useRef<HTMLInputElement>(null)

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				multiple
				style={{ display: 'none' }}
				onChange={(e) => {
					const files = e.target.files ? Array.from(e.target.files) : []
					if (files.length > 0) onFiles(files)
					e.target.value = ''
				}}
			/>
			<Button
				variant="primary"
				icon={<IcUpload />}
				disabled={disabled}
				immediate
				onClick={() => inputRef.current?.click()}
			>
				{label}
			</Button>
		</>
	)
}

// vim: ts=4
