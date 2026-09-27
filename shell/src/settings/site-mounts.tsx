// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { type MountPathProblem, normalizeMountPath, siteTagSlug } from '@cloudillo/core'
import {
	Badge,
	type BadgeProps,
	Button,
	EmptyState,
	HBox,
	IconText,
	Input,
	Panel,
	Table,
	TableCell,
	TableRow,
	Text,
	useDialog
} from '@cloudillo/react'
import type { SiteDoc } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcAlert,
	LuExternalLink as IcExternal,
	LuGlobe as IcGlobe,
	LuPencil as IcPencil,
	LuTrash2 as IcTrash
} from 'react-icons/lu'

import { useDocumentPicker } from '../components/DocumentPicker/index.js'
import { appPath, type CtxBase } from '../routes.js'

/** The MIME a Notillo document registers, and the only thing a site can mount. */
const NOTILLO_CONTENT_TYPE = 'cloudillo/notillo'

/** A document picked but not yet given a path — it has no `site_doc` row yet. */
interface PendingMount {
	docFileId: string
	path: string
}

/**
 * A path suggestion from the document's name, in the shape `normalizeMountPath`
 * accepts. Only a starting point: the field is focused so it can be overtyped.
 *
 * `siteTagSlug` rather than a fold of its own — it is the same NFD-then-`\p{M}` rule
 * a tag slug and a page slug use, and it owns the reason (`libs/core/src/site.ts`).
 * Its 64-character cap is well under `MOUNT_PATH_MAX` and fine for a suggestion.
 */
function suggestPath(fileName: string): string {
	return siteTagSlug(fileName) || 'page'
}

interface MountPathInputProps {
	/** The stored path, so an emptied field can snap back instead of committing. */
	value: string
	label: string
	focus?: boolean
	disabled: boolean
	onCommit: (path: string) => void
}

/**
 * The path of one row, committed on blur rather than on every keystroke: `/blo`
 * is not an error, it is somebody halfway through typing `/blog`. The leading
 * slash is an adornment and not part of the value, so nobody pastes a whole URL
 * into it.
 */
function MountPathInput({ value, label, focus, disabled, onCommit }: MountPathInputProps) {
	const [text, setText] = React.useState(value.replace(/^\//, ''))
	const inputRef = React.useRef<HTMLInputElement>(null)

	// A commit elsewhere — or the server answering with a different path — replaces
	// what is being shown.
	React.useEffect(() => {
		setText(value.replace(/^\//, ''))
	}, [value])

	React.useEffect(() => {
		if (focus) inputRef.current?.focus()
	}, [focus])

	const commit = React.useCallback(
		function commit() {
			const trimmed = text.trim()
			// An emptied field is a slip, not a request to move this document to `/`.
			if (!trimmed) {
				setText(value.replace(/^\//, ''))
				return
			}
			onCommit(`/${trimmed}`)
		},
		[text, value, onCommit]
	)

	return (
		<Input
			ref={inputRef}
			className="w-min-0"
			leading="/"
			type="text"
			value={text}
			disabled={disabled}
			aria-label={label}
			onChange={(evt) => setText(evt.target.value)}
			onBlur={commit}
			onKeyDown={(evt) => {
				if (evt.key === 'Enter') evt.currentTarget.blur()
			}}
		/>
	)
}

/** A message tied to one row or to the panel, read out when it appears. */
function ErrorText({ children }: { children: React.ReactNode }) {
	return (
		<Text as="div" size="sm" color="error" role="alert">
			<IconText icon={<IcAlert />}>{children}</IconText>
		</Text>
	)
}

export interface SiteMountsPanelProps {
	docs: SiteDoc[]
	/** fileId -> file name, filled in by the parent; a missing name shows the id. */
	docNames: Record<string, string>
	isLeader: boolean
	/** The tenant whose documents these are — the picker and the app links need it. */
	contextIdTag?: string
	/** The routing base of the active context, for the "open in Notillo" link. */
	base: CtxBase
	/** Create or repath a row. Rejects on refusal, so the row can say what happened. */
	onMount: (docFileId: string, mountPath: string) => Promise<void>
	onUnmount: (docFileId: string) => Promise<void>
	/**
	 * Adopt a document as the one served at `/`, by mounting it there.
	 *
	 * There is no `null` counterpart, because there is no separate root setting to
	 * clear: the `/` row *is* the root document, so removing that row is what clears
	 * it, and `onUnmount` already does exactly that. Rejects on refusal — `/` may be
	 * held by another document, and the row shows what the server said.
	 */
	onSetRoot: (docFileId: string) => Promise<void>
	/** Remember a name the picker already knew, so no metadata read follows it. */
	onDocumentName: (docFileId: string, fileName: string) => void
}

/**
 * The pages table: which document serves which path.
 *
 * The table is site configuration and lives only here — a document never declares
 * its own path, because only this screen can see the whole site at once. It is
 * flat, one row per document and one row per path, which is what spares it a mount
 * graph, cycle detection and a depth limit. The root document is the pinned first
 * row rather than a field of its own, so `/` is configured where every other path is.
 *
 * Configured path and served path are separate columns, so editing a path cannot
 * break the live site: the move lands at that document's next publish, and until
 * then the row says so. That is why row status is a persistent badge and never a
 * toast — it describes a state, not an event.
 */
export function SiteMountsPanel({
	docs,
	docNames,
	isLeader,
	contextIdTag,
	base,
	onMount,
	onUnmount,
	onSetRoot,
	onDocumentName
}: SiteMountsPanelProps) {
	const { t } = useTranslation()
	const { pickDocument } = useDocumentPicker()
	const dialog = useDialog()
	const [pending, setPending] = React.useState<PendingMount | undefined>()
	const [errors, setErrors] = React.useState<Record<string, string | undefined>>({})
	const [busy, setBusy] = React.useState<string | undefined>()
	// Adopting a root document can fail before the document has a row to carry the
	// message — a refused mount leaves it with none at all — so that one failure is
	// reported at panel level instead of in the table.
	const [rootError, setRootError] = React.useState<string | undefined>()

	const docName = React.useCallback(
		function docName(docFileId: string) {
			return docNames[docFileId] ?? docFileId
		},
		[docNames]
	)

	// The root first, then alphabetically — the order the site reads in.
	const rows = React.useMemo(
		() =>
			[...docs].sort((a, b) => {
				if (a.mountPath === '/') return -1
				if (b.mountPath === '/') return 1
				return a.mountPath.localeCompare(b.mountPath)
			}),
		[docs]
	)

	const setError = React.useCallback(function setError(key: string, message?: string) {
		setErrors((prev) => ({ ...prev, [key]: message }))
	}, [])

	/**
	 * Everything refusable before a request goes out. The server checks the same
	 * things — it has to, it is the only writer — but a path typed into a field
	 * deserves an answer next to the field rather than a failed round trip.
	 */
	const validate = React.useCallback(
		function validate(docFileId: string, raw: string): { path?: string; error?: string } {
			const check = normalizeMountPath(raw)
			if (!check.path) {
				const problemText: Record<MountPathProblem, string> = {
					'not-absolute': t('A path starts at the site root.'),
					'dot-segment': t('A path cannot contain “.” or “..”.'),
					charset: t('Use lowercase letters, digits and dashes only.'),
					'too-long': t('This path is too long.'),
					reserved: t('“{{segment}}” is reserved.', { segment: check.segment ?? '' })
				}
				return { error: problemText[check.problem ?? 'charset'] }
			}
			const clash = rows.find(
				(doc) => doc.docFileId !== docFileId && doc.mountPath === check.path
			)
			if (clash) {
				return {
					error: t('“{{name}}” is already mounted here.', {
						name: docName(clash.docFileId)
					})
				}
			}
			return { path: check.path }
		},
		[rows, docName, t]
	)

	const commitPath = React.useCallback(
		function commitPath(docFileId: string, raw: string, current?: string) {
			const { path, error } = validate(docFileId, raw)
			setError(docFileId, error)
			if (!path || path === current) return
			void (async () => {
				setBusy(docFileId)
				try {
					await onMount(docFileId, path)
					setPending((prev) => (prev?.docFileId === docFileId ? undefined : prev))
					setError(docFileId, undefined)
				} catch (err) {
					setError(docFileId, err instanceof Error ? err.message : String(err))
				} finally {
					setBusy(undefined)
				}
			})()
		},
		[validate, setError, onMount]
	)

	const pick = React.useCallback(
		function pick(title: string) {
			// No `sourceFileId`: that is what makes the shell create an embed share
			// grant, and a same-tenant mount must not have one. No `requirePublic`
			// either — a mounted document stays private, exactly as the root document
			// does. `idTag` is the *context* tag, so a leader picks the community's
			// documents rather than their own.
			return pickDocument({
				contentType: NOTILLO_CONTENT_TYPE,
				idTag: contextIdTag,
				title
			})
		},
		[pickDocument, contextIdTag]
	)

	const onAdd = React.useCallback(
		function onAdd() {
			void (async () => {
				const result = await pick(t('Add a document to the site'))
				if (!result) return
				onDocumentName(result.fileId, result.fileName)
				if (rows.some((doc) => doc.docFileId === result.fileId)) {
					setError(result.fileId, t('This document is already part of the site.'))
					return
				}
				setPending({ docFileId: result.fileId, path: `/${suggestPath(result.fileName)}` })
			})()
		},
		[pick, rows, onDocumentName, setError, t]
	)

	/**
	 * A free path for a document being displaced from `/`, suggested from its name
	 * and then deduped against every path already spoken for.
	 */
	const freePathFor = React.useCallback(
		function freePathFor(docFileId: string) {
			const taken = new Set(rows.map((doc) => doc.mountPath))
			const base = `/${suggestPath(docNames[docFileId] ?? docFileId)}`
			if (!taken.has(base)) return base
			for (let n = 2; ; n++) {
				const candidate = `${base}-${n}`
				if (!taken.has(candidate)) return candidate
			}
		},
		[rows, docNames]
	)

	/**
	 * Pick the document served at `/`.
	 *
	 * When something already holds `/` — which is always, since the control that
	 * reaches this is on the root row — the incumbent is **moved aside, not removed**.
	 * Unmounting it would let the file GC reap both its container generations, and
	 * "change which document is the home page" is not a request to un-publish the old
	 * one. A repath keeps its row, its generations and its live container, which goes
	 * on being served from the path it was built for until that document next
	 * publishes — the same guarantee every other repath in this table gives.
	 *
	 * The move runs first because `/` cannot hold two documents. If the second write
	 * then fails, the incumbent is sitting at a new path: visible in the table, and
	 * repathable back. That is the recoverable failure; the destructive ordering has
	 * none.
	 */
	const onChooseRoot = React.useCallback(
		function onChooseRoot() {
			void (async () => {
				const result = await pick(t('Choose the document to serve at /'))
				if (!result) return
				onDocumentName(result.fileId, result.fileName)
				const incumbent = rows.find((doc) => doc.mountPath === '/')
				if (incumbent?.docFileId === result.fileId) return
				const movedTo = incumbent ? freePathFor(incumbent.docFileId) : undefined
				if (incumbent && movedTo) {
					const confirmed = await dialog.confirm(
						t('Replace the home page?'),
						t('“{{name}}” moves to {{path}} and “{{next}}” is served at / instead.', {
							name: docName(incumbent.docFileId),
							path: movedTo,
							next: result.fileName
						})
					)
					if (!confirmed) return
				}
				setBusy(result.fileId)
				setRootError(undefined)
				try {
					if (incumbent && movedTo) await onMount(incumbent.docFileId, movedTo)
					await onSetRoot(result.fileId)
					setError(result.fileId, undefined)
				} catch (err) {
					setRootError(err instanceof Error ? err.message : String(err))
				} finally {
					setBusy(undefined)
				}
			})()
		},
		[pick, rows, freePathFor, dialog, docName, onMount, onSetRoot, onDocumentName, setError, t]
	)

	// Confirmed in a dialog rather than by swapping the row's buttons in place: the
	// in-row version reflowed the table under the pointer mid-interaction.
	//
	// The root row goes through this too. It used to have a "clear the root document"
	// action of its own that only blanked a stored copy of the fact and left the `/`
	// row standing — a row still badged "Home" under a header reading "No document is
	// served at / yet", and one this table renders with no path field and no remove
	// button, so nothing could repath or remove it afterwards. Removing the row *is*
	// clearing the root, so it is the same operation as every other row's.
	const onRemove = React.useCallback(
		function onRemove(docFileId: string, isRoot: boolean) {
			void (async () => {
				const confirmed = await dialog.confirm(
					isRoot ? t('Stop serving the home page?') : t('Remove from the site?'),
					isRoot
						? t(
								'“{{name}}” stops being served at /, and the site has no home page until another document takes it. The document itself is not deleted.',
								{ name: docNames[docFileId] ?? docFileId }
							)
						: t('“{{name}}” stops being served. The document itself is not deleted.', {
								name: docNames[docFileId] ?? docFileId
							}),
					{ color: 'error', confirmLabel: isRoot ? t('Stop serving') : t('Remove') }
				)
				if (!confirmed) return
				setBusy(docFileId)
				try {
					await onUnmount(docFileId)
					setError(docFileId, undefined)
				} catch (err) {
					setError(docFileId, err instanceof Error ? err.message : String(err))
				} finally {
					setBusy(undefined)
				}
			})()
		},
		[dialog, docNames, onUnmount, setError, t]
	)

	/**
	 * The row's state in words, and always on screen. "This move needs a republish"
	 * is not a moment, it is a condition that lasts until the next publish, so a
	 * toast would say it exactly once and then leave the row lying.
	 */
	function rowStatus(doc: SiteDoc) {
		if (!doc.publishedFileId || !doc.publishedMountPath) return t('Not published yet')
		if (doc.publishedMountPath === doc.mountPath) {
			return t('Serving {{path}}', { path: doc.publishedMountPath })
		}
		return t(
			'Serving {{published}} — moves to {{configured}} when this document is next published',
			{ published: doc.publishedMountPath, configured: doc.mountPath }
		)
	}

	/**
	 * The same three states as `rowStatus`, short enough to sit in a badge. The
	 * neutral state is an uncoloured soft badge.
	 */
	function statusBadge(doc?: SiteDoc): {
		tone: Pick<BadgeProps, 'color' | 'variant'>
		label: string
	} {
		if (!doc) return { tone: { variant: 'soft' }, label: t('Not part of the site yet') }
		if (!doc.publishedFileId || !doc.publishedMountPath) {
			return { tone: { variant: 'soft' }, label: t('Not published') }
		}
		if (doc.publishedMountPath === doc.mountPath) {
			return {
				tone: { color: 'success' },
				label: t('Serving {{path}}', { path: doc.publishedMountPath })
			}
		}
		return {
			tone: { color: 'warning' },
			label: t('Moves to {{path}} on next publish', { path: doc.mountPath })
		}
	}

	/**
	 * The Notillo route for a row, or nothing when there is no context idTag to put
	 * in the resId's owner half. A bare fileId is not a resId, and Notillo would
	 * open the wrong document rather than fail — so the row loses the link instead.
	 */
	function notilloHref(docFileId: string) {
		return contextIdTag ? appPath(base, 'notillo', `${contextIdTag}:${docFileId}`) : undefined
	}

	function renderRow(
		docFileId: string,
		path: string,
		options: {
			isRoot: boolean
			doc?: SiteDoc
			status?: string
			focus?: boolean
			current?: string
		}
	) {
		const error = errors[docFileId]
		const disabled = !isLeader || busy === docFileId
		const badge = statusBadge(options.doc)
		const name = docName(docFileId)
		const href = notilloHref(docFileId)
		return (
			<TableRow key={docFileId}>
				<TableCell>
					<Text as="div" weight="semibold" truncate>
						{name}
					</Text>
				</TableCell>
				<TableCell>
					{options.isRoot ? (
						<HBox gap={1} align="center">
							<Badge color="primary">{t('Home')}</Badge>/
						</HBox>
					) : (
						<MountPathInput
							value={path}
							label={t('Path for {{name}}', { name })}
							focus={options.focus}
							disabled={disabled}
							onCommit={(next) => commitPath(docFileId, next, options.current)}
						/>
					)}
					{error && <ErrorText>{error}</ErrorText>}
				</TableCell>
				<TableCell>
					<Badge {...badge.tone}>{badge.label}</Badge>
					{options.status && options.status !== badge.label && (
						<Text as="div" size="sm" emphasis="muted">
							{options.status}
						</Text>
					)}
				</TableCell>
				<TableCell label="" align="end">
					<HBox gap={1} justify="end">
						{/* An `href` Button, not an onClick: this is a navigation. It
						    renders a real anchor, so middle-click and "copy link" come
						    for free, and it keeps the SPA up. With no href it is inert. */}
						<Button
							href={href}
							disabled={!href}
							aria-label={t('Open in the notes app')}
							icon={<IcExternal />}
						/>
						{options.isRoot && (
							<Button
								disabled={disabled}
								aria-label={t('Change the root document')}
								onClick={onChooseRoot}
								icon={<IcPencil />}
							/>
						)}
						{/* Every row can be removed, the root included: taking the `/` row
						    out is how the home page is cleared, and a row nothing can
						    remove is a row that cannot be fixed. */}
						<Button
							disabled={disabled}
							aria-label={
								options.isRoot ? t('Stop serving at /') : t('Remove from the site')
							}
							onClick={() =>
								// A pending row has no `site_doc` row yet, so there is
								// nothing to unmount — dropping it is the whole undo.
								options.doc
									? onRemove(docFileId, options.isRoot)
									: setPending(undefined)
							}
							icon={<IcTrash />}
						/>
					</HBox>
				</TableCell>
			</TableRow>
		)
	}

	return (
		<Panel
			title={t('Pages')}
			actions={
				(!!rows.length || pending) && (
					<Button disabled={!isLeader || !!pending} onClick={onAdd}>
						{t('Add a document')}
					</Button>
				)
			}
			description={
				rows.length || pending
					? t('Changing a path takes effect when that document is next published.')
					: undefined
			}
		>
			{!rows.length && !pending ? (
				<EmptyState
					icon={<IcGlobe size={32} />}
					title={t('No site yet')}
					description={t(
						'A site serves the pages of your documents at your own address.'
					)}
					action={
						<Button color="primary" disabled={!isLeader} onClick={onChooseRoot}>
							{t('Choose the document to serve at /')}
						</Button>
					}
				/>
			) : (
				<>
					<Table
						variant="hoverable"
						stack
						aria-label={t('Pages')}
						columns={[t('Document'), t('Path'), t('Status'), t('Actions')]}
					>
						{rows.map((doc) =>
							renderRow(doc.docFileId, doc.mountPath, {
								isRoot: doc.mountPath === '/',
								doc,
								status: rowStatus(doc),
								current: doc.mountPath
							})
						)}
						{pending &&
							renderRow(pending.docFileId, pending.path, {
								isRoot: false,
								status: t('Not part of the site yet — give it a path.'),
								focus: true
							})}
					</Table>
					{rootError && <ErrorText>{rootError}</ErrorText>}
				</>
			)}
		</Panel>
	)
}

// vim: ts=4
