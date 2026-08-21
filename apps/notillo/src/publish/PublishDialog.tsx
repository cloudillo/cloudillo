// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What the author sees before anything becomes public.
 *
 * Publishing is a whole-document act, which is what makes per-page `draft`
 * default to published safe: nothing reaches the web until this dialog is
 * confirmed, and it says what will go live, what changed, and what a draft
 * quietly took with it. The blocking findings — a reference an anonymous reader
 * could not fetch, a slug the node itself owns, and a drafted home page — come with
 * the fix beside them rather than as an error after the fact.
 *
 * Never auto-promote: "Make public" is offered as an action and is always a
 * click, never something publishing does on the author's behalf.
 *
 * The same dialog runs check-only (`mode="check"`): the gate finds a broken
 * reference at publish time, but a file's
 * visibility can be lowered afterwards and the site degrades silently — the
 * author still sees everything, because they can read their own files. So the
 * check is offered on its own, whenever they want it. It shows the reference
 * findings and nothing else; what would go live is a publish question.
 */

import { Button, Modal } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcAlert,
	LuX as IcClose,
	LuEyeOff as IcHidden,
	LuHouse as IcHome,
	LuLock as IcLock
} from 'react-icons/lu'

import type { PublishRef, PublishReport, PublishReservedIssue, PublishSlugIssue } from './gate.js'

/** Gate a publish, or run the reference check on its own. */
export type PublishDialogMode = 'publish' | 'check'

export interface PublishDialogProps {
	open: boolean
	/**
	 * `publish` ends in a Publish button and reports everything the publish would
	 * do; `check` runs the same gate for its findings alone and offers only the
	 * fixes. Defaults to `publish`.
	 */
	mode?: PublishDialogMode
	/** Absent while the gate is still reading the document. */
	report?: PublishReport
	loading: boolean
	/** The gate itself failed — a read error, not a finding. */
	error?: string
	publishing: boolean
	/**
	 * Where this document is mounted on the site, read-only.
	 *
	 * Shown because every link the container emits is absolute and baked from it:
	 * an author writing in a document mounted at `/blog` is writing
	 * `/blog/…`, and nothing else on this screen would say so. It is changed in
	 * site settings, never here — a document does not declare its own path.
	 *
	 * Absent while the lookup is in flight, or when it failed.
	 */
	mountPath?: string
	/**
	 * The signed-in user may change a file's visibility. False hides the "Make
	 * public" action and leaves "Remove", so a collaborator without standing on
	 * the file is told what to do rather than shown a button that would 403.
	 */
	canMakePublic: boolean
	onMakePublic: (ref: PublishRef) => Promise<void>
	onRemove: (ref: PublishRef) => Promise<void>
	/** Open a page in the editor, so a reserved slug can be fixed where it lives. */
	onGoToPage: (pageId: string) => void
	/**
	 * Close the dialog and take the author to the sidebar's home picker.
	 *
	 * The fix for "no home page" is not on any one page, so there is no page to open
	 * — this is the only finding whose action leaves the publish flow entirely.
	 */
	onChooseHome: () => void
	onPublish: () => void
	onClose: () => void
}

/** A file's key in the busy set — a fileId can appear as both a media and an embed. */
function refKey(ref: PublishRef): string {
	return `${ref.kind}:${ref.fileId}`
}

/** Every page a reference sits on, deduplicated — a file can repeat on one page. */
function refPageTitles(ref: PublishRef): string[] {
	return [...new Set(ref.sites.map((site) => site.title))]
}

function BlockedRefRow({
	busy,
	canMakePublic,
	onMakePublic,
	onRemove,
	refItem,
	untitled
}: {
	refItem: PublishRef
	busy: boolean
	canMakePublic: boolean
	onMakePublic: () => void
	onRemove: () => void
	untitled: string
}) {
	const { t } = useTranslation()
	const titles = refPageTitles(refItem).map((title) => title || untitled)
	// "Remove" deletes blocks, and a page's social image is not one — the author
	// clears it in the page properties pane. The row still lists and still blocks.
	const removable = refItem.sites.some((site) => site.blockId !== undefined)
	return (
		<li className="c-vbox g-1">
			<div className="c-hbox g-2 align-items-center">
				<IcLock />
				<span className="fill">
					{refItem.kind === 'embed'
						? t('Embedded document {{name}}', {
								name: refItem.fileName || refItem.fileId
							})
						: refItem.fileName || refItem.fileId}
				</span>
				{canMakePublic && (
					<Button size="small" disabled={busy} onClick={onMakePublic}>
						{busy ? t('Working…') : t('Make public')}
					</Button>
				)}
				{removable && (
					<Button size="small" disabled={busy} onClick={onRemove}>
						{t('Remove')}
					</Button>
				)}
			</div>
			<div className="c-hint">
				{refItem.visibility === undefined
					? t('Could not be read — it may have been deleted.')
					: refItem.kind === 'pageImage'
						? t('Not public. The social image of: {{pages}}', {
								pages: titles.join(', ')
							})
						: // The occurrence count, not just the page titles: "Remove"
							// deletes every block behind this one row, and the titles
							// alone do not say how many that is — a page may reference
							// the same file more than once.
							refItem.sites.length === 1
							? t('Not public. On: {{pages}}', { pages: titles.join(', ') })
							: t('Not public. {{count}} blocks, on: {{pages}}', {
									count: refItem.sites.length,
									pages: titles.join(', ')
								})}
			</div>
		</li>
	)
}

function reservedHint(issue: PublishReservedIssue, t: TFunction): string {
	const hints: Record<PublishReservedIssue['reason'], string> = {
		site: t('“{{slug}}” belongs to Cloudillo itself.', { slug: issue.slug }),
		container: t('“{{slug}}” belongs to the site builder.', { slug: issue.slug })
	}
	return hints[issue.reason]
}

/**
 * A stored slug that is not a usable address. The container would publish the page
 * under a folded version of it, so the hint says which address it would get rather
 * than only what is wrong with the stored one.
 */
function badSlugHint(issue: PublishSlugIssue, t: TFunction): string {
	const hints: Record<PublishSlugIssue['problem'], string> = {
		chars: t('“{{slug}}” may only hold lowercase letters, digits and dashes.', {
			slug: issue.slug
		}),
		edges: t('“{{slug}}” may not start or end with a dash.', { slug: issue.slug }),
		'too-long': t('“{{slug}}” is too long for an address.', { slug: issue.slug }),
		duplicate: t('Another page in the same place already uses the address “{{slug}}”.', {
			slug: issue.slug
		})
	}
	return hints[issue.problem]
}

/**
 * One page the gate has something to say about: its title, a way to open it, and one
 * line of why.
 *
 * Every finding section renders this shape — a reserved name, an unusable stored
 * slug, the drafted home page. Only the icon and the hint differ, and the hint is the
 * caller's because that is where the finding's own `Record` of messages belongs.
 */
function IssueRow({
	title,
	hint,
	onGoToPage,
	icon
}: {
	title: string
	hint: string
	/** Absent where there is no page to open — a home page that no longer exists. */
	onGoToPage?: () => void
	icon?: React.ReactNode
}) {
	const { t } = useTranslation()
	return (
		<li className="c-vbox g-1">
			<div className="c-hbox g-2 align-items-center">
				{icon ?? <IcAlert />}
				<span className="fill">{title}</span>
				{onGoToPage && (
					<Button size="small" onClick={onGoToPage}>
						{t('Open page')}
					</Button>
				)}
			</div>
			<div className="c-hint">{hint}</div>
		</li>
	)
}

export function PublishDialog({
	open,
	mode = 'publish',
	report,
	loading,
	error,
	publishing,
	mountPath,
	canMakePublic,
	onMakePublic,
	onRemove,
	onGoToPage,
	onChooseHome,
	onPublish,
	onClose
}: PublishDialogProps) {
	const { t } = useTranslation()
	const [busy, setBusy] = React.useState<ReadonlySet<string>>(new Set())
	const untitled = t('Untitled')

	const runRefAction = React.useCallback(
		async (refItem: PublishRef, action: (ref: PublishRef) => Promise<void>) => {
			const key = refKey(refItem)
			setBusy((prev) => new Set(prev).add(key))
			try {
				await action(refItem)
			} finally {
				setBusy((prev) => {
					const next = new Set(prev)
					next.delete(key)
					return next
				})
			}
		},
		[]
	)

	if (!open) return null

	// Checking reports on references and stops there. A draft, a frozen slug or a
	// page about to go live are all answers to "what happens if I publish", which
	// is not the question that was asked.
	const checking = mode === 'check'
	const statusLabel: Record<string, string> = {
		new: t('new'),
		updated: t('changed'),
		unchanged: t('unchanged')
	}
	// Own drafts are the author's own decision and need no warning. The pages a
	// draft took with it are the ones nobody chose to unpublish.
	const collateral = report?.suppressed.filter((page) => !page.own) ?? []
	const ownDrafts = report?.suppressed.filter((page) => page.own) ?? []
	const freezing = report?.pages.filter((page) => page.freezesSlug) ?? []
	const orphaned = report?.orphaned ?? []
	// The drafted home page is the one suppressed page with no path of its own, so
	// the report needs no field to name it twice.
	const draftedHome = report?.homeDraft
		? report.suppressed.find((page) => page.path === '')
		: undefined
	const canPublish = !!report && report.ok && !report.empty && !publishing && !loading

	return (
		<Modal open onClose={publishing ? undefined : onClose} className="p-0">
			<div
				className="notillo-publish-dialog c-dialog c-panel h-max-100 emph p-4 c-vbox g-3"
				style={{ maxWidth: '38rem', width: '90vw' }}
			>
				<div className="c-hbox align-items-center g-2">
					<h2 className="fill m-0">
						{checking ? t('Check references') : t('Publish site')}
					</h2>
					<Button
						kind="link"
						mode="icon"
						size="small"
						title={t('Close')}
						onClick={onClose}
					>
						<IcClose />
					</Button>
				</div>

				<div className="c-vbox g-4 overflow-y-auto">
					{loading && <p className="c-hint m-0">{t('Checking the document…')}</p>}
					{error && <p className="text-error m-0">{error}</p>}

					{report && report.blocked.length > 0 && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0 text-error">
								{t('These are not public yet')}
							</h3>
							<p className="c-hint m-0">
								{t(
									'A published page is read by anyone, so everything it shows has to be public.'
								)}
							</p>
							<ul className="c-vbox g-2 m-0">
								{report.blocked.map((refItem) => (
									<BlockedRefRow
										key={refKey(refItem)}
										refItem={refItem}
										busy={busy.has(refKey(refItem))}
										canMakePublic={canMakePublic}
										onMakePublic={() => runRefAction(refItem, onMakePublic)}
										onRemove={() => runRefAction(refItem, onRemove)}
										untitled={untitled}
									/>
								))}
							</ul>
						</section>
					)}

					{/* The clean answer is the whole point of checking, so it is said
					    rather than left as an empty dialog. */}
					{checking && report && report.blocked.length === 0 && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0">
								{t('Everything is readable')}
							</h3>
							<p className="c-hint m-0">
								{report.refs.length === 0
									? t('These pages show no images, files or embedded documents.')
									: t(
											'All {{count}} reference(s) point at something a visitor can open.',
											{ count: report.refs.length }
										)}
							</p>
						</section>
					)}

					{!checking && report && report.reserved.length > 0 && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0 text-error">
								{t('These addresses are taken')}
							</h3>
							<ul className="c-vbox g-2 m-0">
								{report.reserved.map((issue) => (
									<IssueRow
										key={issue.pageId}
										title={issue.title || untitled}
										hint={reservedHint(issue, t)}
										onGoToPage={() => onGoToPage(issue.pageId)}
									/>
								))}
							</ul>
						</section>
					)}

					{!checking && report && report.badSlugs.length > 0 && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0 text-error">
								{t('These addresses are not usable')}
							</h3>
							<ul className="c-vbox g-2 m-0">
								{report.badSlugs.map((issue) => (
									<IssueRow
										key={issue.pageId}
										title={issue.title || untitled}
										hint={badSlugHint(issue, t)}
										onGoToPage={() => onGoToPage(issue.pageId)}
									/>
								))}
							</ul>
						</section>
					)}

					{/* Blocking: with the home page drafted the mount root serves
					    nothing, and the author drafted the one page nothing links to. */}
					{!checking && report?.homeDraft && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0 text-error">
								{t('Your home page is a draft')}
							</h3>
							<ul className="c-vbox g-2 m-0">
								<IssueRow
									icon={<IcHome />}
									title={draftedHome?.title || untitled}
									hint={t(
										'Turn the draft off to publish it, or choose a different home page.'
									)}
									onGoToPage={
										draftedHome
											? () => onGoToPage(draftedHome.pageId)
											: undefined
									}
								/>
							</ul>
						</section>
					)}

					{/* Advisory: a document that never claimed its mount root still
					    publishes, exactly as it did before a home page existed. */}
					{!checking && report?.homeMissing && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0">{t('No home page')}</h3>
							<ul className="c-vbox g-2 m-0">
								<li className="c-hbox g-2 align-items-center">
									<IcAlert />
									<span className="fill">
										{t('Visitors to {{path}} will see nothing.', {
											path: mountPath ?? '/'
										})}
									</span>
									<Button size="small" onClick={onChooseHome}>
										{t('Choose a home page')}
									</Button>
								</li>
							</ul>
						</section>
					)}

					{!checking && report && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0">
								{report.empty
									? t('Nothing would go live')
									: t('{{count}} page(s) go live', {
											count: report.pages.length
										})}
							</h3>
							{report.empty ? (
								<p className="c-hint m-0">
									{t('Every page is a draft, so the site would be empty.')}
								</p>
							) : (
								<table className="c-table compact borderless">
									<tbody>
										{report.pages.map((page) => (
											<tr key={page.pageId}>
												<td>{page.title || untitled}</td>
												<td className="c-hint">/{page.path}</td>
												<td className="text-sm notillo-publish-status">
													{statusLabel[page.status]}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</section>
					)}

					{!checking && collateral.length > 0 && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0">
								{t('Removed by a draft above them')}
							</h3>
							<ul className="c-vbox g-2 m-0">
								{collateral.map((page) => (
									<li key={page.pageId} className="c-hbox g-2 align-items-center">
										<IcHidden />
										<span className="fill">{page.title || untitled}</span>
										<span className="c-hint">
											{page.draftedAncestor
												? t('under draft “{{title}}”', {
														title: page.draftedAncestor || untitled
													})
												: ''}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}

					{/* The asides collect into one quiet block: read as footnotes rather
					    than as four more findings competing with the sections above. */}
					{!checking && (
						<section className="c-vbox g-2">
							<h3 className="c-settings-section-title m-0">{t('Good to know')}</h3>
							<ul className="c-vbox g-1 m-0">
								{mountPath && (
									<li className="c-hint">
										{t(
											'Publishing to {{path}} — every link on these pages starts there.',
											{ path: mountPath }
										)}
									</li>
								)}
								{ownDrafts.length > 0 && (
									<li className="c-hint">
										{t('{{count}} draft page(s) stay off the site.', {
											count: ownDrafts.length
										})}
									</li>
								)}
								{orphaned.length > 0 && (
									<li className="c-hint">
										{t(
											'{{count}} page(s) are not in the sidebar tree and go live at the top level.',
											{ count: orphaned.length }
										)}
									</li>
								)}
								{freezing.length > 0 && (
									<li className="c-hint">
										{t(
											'{{count}} page(s) get their address fixed by this publish — renaming them later will not move it.',
											{ count: freezing.length }
										)}
									</li>
								)}
								<li className="c-hint">
									{t(
										'Comments are never published — they stay inside the document.'
									)}
								</li>
							</ul>
						</section>
					)}
				</div>

				<div className="c-hbox justify-content-end g-2">
					<Button disabled={publishing} onClick={onClose}>
						{checking ? t('Close') : t('Cancel')}
					</Button>
					{!checking && (
						<Button variant="primary" disabled={!canPublish} onClick={onPublish}>
							{publishing ? t('Publishing…') : t('Publish')}
						</Button>
					)}
				</div>
			</div>
		</Modal>
	)
}

// vim: ts=4
