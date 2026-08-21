// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { downloadBlob, sanitizeFilename } from '@cloudillo/core'
import { Badge, Button, EmptyState, LoadingSpinner, useAuth, useToast } from '@cloudillo/react'
import type { SiteConfig, SiteNavItem } from '@cloudillo/types'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuGlobe as IcGlobe, LuLock as IcLock } from 'react-icons/lu'
import { Link } from 'react-router-dom'

import {
	activeContextAtom,
	isContextLeader,
	useContextAwareApi,
	useCtx,
	useCurrentContextIdTag
} from '../context/index.js'
import { appPath } from '../routes.js'
import { SiteMountsPanel } from './site-mounts.js'
import { SiteNavPanel } from './site-nav.js'

/** Shared empty list, so "no explicit nav" keeps one identity across renders. */
const EMPTY_NAV: SiteNavItem[] = []

/**
 * Site configuration — the root document, which document serves which path, the
 * site's main navigation, and each published document's two generations with
 * rollback and download.
 *
 * Publishing is not here: the container is generated in Notillo, so each document
 * gets a link that opens it there instead. The mount table *is* here and only here —
 * a document never declares its own path, because this is the one screen that sees
 * the whole site at once.
 *
 * The root document is the Pages table's `/` row and nothing else; there is no stored
 * copy of it anywhere.
 *
 * Read and written through `useContextAwareApi()` rather than `useApi()`, so a
 * community leader configures the community's site instead of their own.
 */
export function SiteSettings() {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const { success: toastSuccess, error: toastError } = useToast()
	const [auth] = useAuth()
	const activeContext = useAtomValue(activeContextAtom)
	const { base } = useCtx()
	const isLeader = isContextLeader(activeContext, auth?.idTag)

	// The shared hook, not a local derivation: it carries the `apiState.idTag`
	// fallback a hand-rolled `activeContext ?? auth` drops, and `undefined` here is
	// what would otherwise put a resId with no owner half into a `<Link>`.
	const contextIdTag = useCurrentContextIdTag()

	const [config, setConfig] = React.useState<SiteConfig | undefined>()
	// The load failed and nothing is on screen. Kept apart from the toast so the page
	// can offer a retry instead of a spinner that never resolves.
	const [loadError, setLoadError] = React.useState(false)
	const [reload, setReload] = React.useState(0)
	// The document currently being rolled back, so only its own button spins.
	const [rollingBack, setRollingBack] = React.useState<string | undefined>()
	// A row stores a fileId, which names nothing to a reader. A failed lookup falls
	// back to the id rather than hiding the row — an unreadable row is the lesser
	// failure of the two.
	const [docNames, setDocNames] = React.useState<Record<string, string>>({})
	const namesRequested = React.useRef(new Set<string>())

	const rememberDocName = React.useCallback(function rememberDocName(
		docFileId: string,
		fileName: string
	) {
		namesRequested.current.add(docFileId)
		setDocNames((prev) =>
			prev[docFileId] === fileName ? prev : { ...prev, [docFileId]: fileName }
		)
	}, [])

	React.useEffect(
		function loadSiteConfigEffect() {
			if (!api) return
			let cancelled = false
			setLoadError(false)
			api.site
				.get()
				.then((next) => {
					if (cancelled) return
					setLoadError(false)
					setConfig(next)
				})
				.catch(() => {
					if (cancelled) return
					setLoadError(true)
					toastError(t('Failed to load the site settings.'))
				})
			return function cancelLoad() {
				cancelled = true
			}
		},
		[api, reload, t, toastError]
	)

	React.useEffect(
		function loadDocumentNamesEffect() {
			if (!api || !config) return
			// Every document the page can name has a row, the root included, so the
			// mount table is the whole set.
			const ids = new Set(config.docs.map((doc) => doc.docFileId))
			for (const docFileId of ids) {
				// One read per document, ever: names are asked for by id and the id
				// is what a row falls back to, so a failure needs no retry.
				if (namesRequested.current.has(docFileId)) continue
				namesRequested.current.add(docFileId)
				api.files
					.getMetadata(docFileId)
					.then((file) => {
						// No `cancelled` guard, deliberately. `config` gets a fresh
						// identity from every write on this page, so this effect re-runs
						// and supersedes its own in-flight reads — and the id is already
						// in `namesRequested`, so there is no retry behind it. Discarding
						// the answer here left those rows showing raw fileIds for the rest
						// of the session. `rememberDocName` is an idempotent id → name
						// merge, so a superseded run writing it is harmless.
						rememberDocName(docFileId, file.fileName)
					})
					.catch(() => {})
			}
		},
		[api, config, rememberDocName]
	)

	/**
	 * Adopt a document as the one served at `/`.
	 *
	 * **The `/` mount row is the root document** — the whole of it. Serving resolves `/`
	 * through `resolve_mount("/")` over the mount table alone, so this one write is the
	 * setting, and the one that can be refused.
	 */
	const applyRootDocument = React.useCallback(
		async function applyRootDocument(docFileId: string) {
			if (!api) return
			setConfig(await api.site.mount({ docFileId, mountPath: '/' }))
		},
		[api]
	)

	const onMount = React.useCallback(
		async function onMount(docFileId: string, mountPath: string) {
			if (!api) return
			setConfig(await api.site.mount({ docFileId, mountPath }))
		},
		[api]
	)

	// Removing the `/` row is how the root document is cleared — there is no separate
	// "clear the root" write, because there is no separate root setting.
	const onUnmount = React.useCallback(
		async function onUnmount(docFileId: string) {
			if (!api) return
			setConfig(await api.site.unmount({ docFileId }))
		},
		[api]
	)

	// The navigation is the only thing the site record itself stores, so this is the
	// page's one PATCH. `null` is the editor's "reset to automatic": storage spells
	// that as empty.
	const onSaveNav = React.useCallback(
		async function onSaveNav(nav: SiteNavItem[] | null) {
			if (!api) return
			setConfig(await api.site.update({ nav }))
		},
		[api]
	)

	// Read only when the target picker opens: the server opens one container per
	// mount to answer, so it is never cached alongside the config.
	const onLoadPages = React.useCallback(
		async function onLoadPages() {
			if (!api) return []
			return await api.site.pages()
		},
		[api]
	)

	const onRollback = React.useCallback(
		async function onRollback(docFileId: string) {
			if (!api) return
			setRollingBack(docFileId)
			try {
				const doc = await api.site.rollback({ docFileId })
				// Splice the one row the server answered with rather than refetching:
				// the swap touches exactly this document, and the answer is the row.
				setConfig((prev) =>
					prev
						? {
								...prev,
								docs: prev.docs.map((d) => (d.docFileId === docFileId ? doc : d))
							}
						: prev
				)
				toastSuccess(t('Rolled back to the previous version.'))
			} catch (_err) {
				toastError(t('Failed to roll back.'))
			} finally {
				setRollingBack(undefined)
			}
		},
		[api, t, toastSuccess, toastError]
	)

	// A container is an ordinary managed file, so the existing file route serves it
	// under its own ABAC — but the token goes in a header, never the URL: in an href it
	// would be one right-click from being copied out, and would land in browser history
	// and the download manager besides. `api.files.get` also signs the read with the
	// token for the tenant it is addressing, so a community context does not send the
	// user's own-node token to the community's host.
	const downloadGeneration = React.useCallback(
		async function downloadGeneration(fileId: string, fileName: string) {
			if (!api) return
			try {
				const res = await api.files.get(fileId)
				if (!res.ok) throw new Error(String(res.status))
				downloadBlob(await res.blob(), fileName)
			} catch (_err) {
				toastError(t('Failed to download the container.'))
			}
		},
		[api, t, toastError]
	)

	// Nothing to sign the read with, so the control is offered but inert — the
	// previous `href` form simply had no URL to render in the same situation.
	const canDownload = !!api

	// A failed load leaves nothing on screen to act on, and the spinner below would
	// otherwise short-circuit every render from here on — the only recovery being a
	// full page reload. The toast in the effect stays: it is the right feedback for a
	// *refresh* that fails while a config is already up, which is why this tests
	// `!config`.
	if (loadError && !config)
		return (
			<div className="c-panel c-site-panel c-vbox g-2 align-items-start">
				<div role="alert">{t('Failed to load the site settings.')}</div>
				<Button onClick={() => setReload((n) => n + 1)}>{t('Retry')}</Button>
			</div>
		)

	if (!config) return <LoadingSpinner />

	// The `/` row *is* the root document — the one fact, read from the one place that
	// serving reads it from.
	const rootRow = config.docs.find((doc) => doc.mountPath === '/')
	// The root document's own mount, once it has been published. A row now exists
	// from the moment the document is added to the site, so the row alone no longer
	// says anything has been served.
	const rootDoc = rootRow?.publishedFileId ? rootRow : undefined
	// A row without a container has no generations to list.
	const publishedDocs = config.docs.filter((doc) => doc.publishedFileId)
	const rootDocId = rootRow?.docFileId
	// Assumes the site is served on the tenant's own host. `tSite` carries no host
	// field on purpose — "the site host is always the tenant's app domain, which the
	// backend derives" — so there is nothing better to read, and a site fronted by a
	// separate domain gets a link to the tenant host instead.
	const siteUrl = contextIdTag ? `https://${contextIdTag}/` : undefined
	// A stable array while the site record is null, so the nav editor's store-sync
	// effect is not handed a new identity on every render of this page.
	const navItems = config.site?.nav ?? EMPTY_NAV

	// `published_at` is a single column, restamped by every publish and by every
	// rollback, so it dates the generation *currently served* — never the container.
	// That is why the previous entry below reads "replaced", not "published".
	function formatStamp(stamp: string) {
		const date = new Date(stamp)
		return Number.isNaN(date.getTime()) ? stamp : date.toLocaleString()
	}

	return (
		<>
			{!isLeader && (
				<div className="c-panel c-site-panel">
					<p className="c-hint c-hbox align-items-center g-2">
						<IcLock className="flex-shrink-0" />
						{t('Only the owner or a community leader can change these settings.')}
					</p>
				</div>
			)}

			<div className="c-panel c-site-panel">
				<h4 className="pb-2">{t('Site')}</h4>

				<div className="c-hbox g-2 align-items-center flex-wrap">
					<IcGlobe className="flex-shrink-0 text-muted" />
					{siteUrl ? (
						<a
							className="c-link flex-fill w-min-0 text-truncate"
							href={siteUrl}
							target="_blank"
							rel="noreferrer"
						>
							{siteUrl}
						</a>
					) : (
						<span className="flex-fill w-min-0 c-hint">{t('Not configured')}</span>
					)}
					{/* The tone rides on `className`: `neutral` is an OpalUI badge colour
					    that `ColorVariant` does not name, and Badge merges either alike. */}
					<Badge
						className={`flex-shrink-0 ${!config.site ? 'neutral' : rootDoc ? 'success' : 'warning'}`}
					>
						{!config.site
							? t('Not configured')
							: rootDoc
								? t('Live')
								: t('Nothing published yet')}
					</Badge>
				</div>
				<p className="c-hint small">
					{rootDocId
						? t('Published from “{{name}}”', {
								name: docNames[rootDocId] ?? rootDocId
							})
						: t('No document is served at / yet.')}
					{' · '}
					{t('{{count}} documents mounted', { count: config.docs.length })}
				</p>
				<p className="c-hint">
					{t('Publishing happens in the notes app that holds the document.')}
				</p>
			</div>

			<SiteMountsPanel
				docs={config.docs}
				docNames={docNames}
				isLeader={isLeader}
				contextIdTag={contextIdTag}
				base={base}
				onMount={onMount}
				onUnmount={onUnmount}
				onSetRoot={applyRootDocument}
				onDocumentName={rememberDocName}
			/>

			<SiteNavPanel
				nav={navItems}
				derivedNav={config.derivedNav}
				docs={config.docs}
				docNames={docNames}
				isLeader={isLeader}
				onSave={onSaveNav}
				onLoadPages={onLoadPages}
			/>

			<div className="c-panel c-site-panel">
				<h4 className="pb-2">{t('Published versions')}</h4>
				{!publishedDocs.length ? (
					<EmptyState
						size="sm"
						title={t('Nothing published yet')}
						description={t('Publish from the notes app.')}
					/>
				) : (
					<>
						<p className="c-hint">
							{t(
								'Each document keeps the version being served and the one before it. Rolling back swaps them, and rolling back again puts it right.'
							)}
						</p>
						<table className="c-table hoverable c-site-table">
							<thead>
								<tr>
									<th>{t('Document')}</th>
									<th>{t('Serving')}</th>
									<th>{t('Previous')}</th>
								</tr>
							</thead>
							<tbody>
								{publishedDocs.map((doc) => {
									// Named after the document, not after the opaque fileId the
									// row stores, so a downloaded container says what it holds.
									const baseName = sanitizeFilename(
										docNames[doc.docFileId] ?? doc.docFileId
									)
									// Bound before the JSX: TypeScript will not narrow a
									// mutable property inside a closure that runs later.
									const currentFileId = doc.publishedFileId
									const previousFileId = doc.previousFileId
									return (
										<tr key={doc.docFileId}>
											<td data-label={t('Document')}>
												<strong className="d-block text-truncate">
													{docNames[doc.docFileId] ?? doc.docFileId}
												</strong>
												<span className="c-hint small d-block">
													{doc.mountPath}
												</span>
												{/* No context idTag means no owner half, and a
												    bare fileId is not a resId — Notillo would
												    open the wrong document, or none. Plain
												    text until one resolves. */}
												{contextIdTag ? (
													<Link
														className="c-link small"
														to={appPath(
															base,
															'notillo',
															`${contextIdTag}:${doc.docFileId}`
														)}
													>
														{t('Open in the notes app')}
													</Link>
												) : (
													<span className="c-hint small">
														{t('Open in the notes app')}
													</span>
												)}
											</td>
											<td data-label={t('Serving')}>
												<span className="d-block">
													{formatStamp(doc.publishedAt ?? '')}
												</span>
												{currentFileId && (
													<Button
														kind="link"
														className="small"
														disabled={!canDownload}
														onClick={() =>
															void downloadGeneration(
																currentFileId,
																`${baseName}.zip`
															)
														}
													>
														{t('Download')}
													</Button>
												)}
											</td>
											<td data-label={t('Previous')}>
												{previousFileId ? (
													<div className="c-vbox g-1 align-items-start">
														<span className="c-hint small">
															{t('replaced')}{' '}
															{formatStamp(doc.publishedAt ?? '')}
														</span>
														<Button
															kind="link"
															className="small"
															disabled={!canDownload}
															onClick={() =>
																void downloadGeneration(
																	previousFileId,
																	`${baseName}-previous.zip`
																)
															}
														>
															{t('Download')}
														</Button>
														<Button
															variant="secondary"
															disabled={
																!isLeader ||
																rollingBack === doc.docFileId
															}
															onClick={() =>
																onRollback(doc.docFileId)
															}
														>
															{t('Roll back')}
														</Button>
													</div>
												) : (
													<span className="c-hint">—</span>
												)}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</>
				)}
			</div>
		</>
	)
}

// vim: ts=4
