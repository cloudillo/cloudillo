// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ReservedReason } from '@cloudillo/core'
import { reservedSlugReason } from '@cloudillo/core'
import {
	Button,
	Input,
	LoadingSpinner,
	NativeSelect,
	PropertyField,
	PropertySection,
	TextArea,
	Toggle
} from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as T from '@symbion/runtype'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuHouse as IcHome } from 'react-icons/lu'

import { usePageProperties } from '../hooks/usePageProperties.js'
import { tSiteArchetypeName } from '../publish/render/index.js'
import { slugify, slugProblem } from '../publish/slug.js'
import type { PageUpdate } from '../rtdb/page-ops.js'
import { ARCHETYPE_NAMES, knownArchetype, type SiteArchetypeName } from '../utils/archetype.js'
import type { DerivedPageMeta } from '../utils/page-meta.js'

/** Wide enough for the longest label, narrow enough to leave a usable control. */
const LABEL_WIDTH = 96

/**
 * The label for one option of the archetype select.
 *
 * The select may offer a name from a newer Notillo that this build has no label
 * for, so the name is decoded before it is used as a key — which is also what keeps
 * a stored `kind` of `'constructor'` from reaching a plain object index.
 */
function archetypeLabel(name: string, labels: Record<SiteArchetypeName, string>): string {
	const decoded = T.decode(tSiteArchetypeName, name)
	return T.isOk(decoded) ? labels[decoded.ok] : name
}

/**
 * One archetype select — the page's own `kind`, or the `childKind` a new child gets.
 *
 * A `kind` this build has no archetype for would publish as a plain page and vanish
 * from the select, so it is offered back as its own option — including a page still
 * carrying the retired `index` archetype, which now reads as unknown. Both selects
 * need that rule, which is why there is one component and not two.
 */
function ArchetypeSelect({
	label,
	value,
	emptyLabel,
	labels,
	readOnly,
	onChange
}: {
	label: string
	/** `null` and absent are the same thing: nothing stored, so the empty option. */
	value: string | null | undefined
	/** What "nothing stored" is called — the two selects inherit differently. */
	emptyLabel: string
	labels: Record<SiteArchetypeName, string>
	readOnly: boolean
	onChange: (value: string | null) => void
}) {
	const unknown = knownArchetype(value) ? undefined : value
	const names: readonly string[] = unknown ? [...ARCHETYPE_NAMES, unknown] : ARCHETYPE_NAMES
	return (
		<PropertyField label={label} labelWidth={LABEL_WIDTH}>
			<NativeSelect
				className="w-100"
				value={value ?? ''}
				disabled={readOnly}
				onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
					onChange(e.target.value || null)
				}
			>
				<option value="">{emptyLabel}</option>
				{names.map((name) => (
					<option key={name} value={name}>
						{archetypeLabel(name, labels)}
					</option>
				))}
			</NativeSelect>
		</PropertyField>
	)
}

interface TextPropertyProps {
	label: string
	/** `null` and absent are the same thing here: a cleared field shows empty. */
	value: string | null | undefined
	/** What the field would produce if left empty — shown, never submitted. */
	placeholder?: string
	readOnly: boolean
	multiline?: boolean
	/** Shown under the control: a refused commit, or a warning about the value. */
	notice?: React.ReactNode
	onCommit: (value: string | null) => void
}

/**
 * One text field, committed on blur rather than on every keystroke.
 *
 * Every commit is an RTDB write and these are short fields typed in one go, so
 * a per-keystroke debounce would buy nothing and lose the one thing blur gives
 * for free: an unambiguous moment at which the value is final. Emptying a field
 * commits `null`, which clears the stored value and restores the derived one.
 */
function TextProperty({
	label,
	value,
	placeholder,
	readOnly,
	multiline,
	notice,
	onCommit
}: TextPropertyProps) {
	const [text, setText] = React.useState(value ?? '')

	// A save elsewhere — or simply another page — replaces what is being shown.
	React.useEffect(() => {
		setText(value ?? '')
	}, [value])

	const commit = React.useCallback(() => {
		const trimmed = text.trim()
		if (trimmed === (value ?? '')) return
		onCommit(trimmed || null)
	}, [text, value, onCommit])

	const props = {
		value: text,
		placeholder,
		disabled: readOnly,
		onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
			setText(e.target.value),
		onBlur: commit
	}

	return (
		<PropertyField label={label} labelWidth={LABEL_WIDTH}>
			<div className="c-vbox g-1 w-100">
				{multiline ? (
					<TextArea className="w-100" rows={3} {...props} />
				) : (
					<Input
						className="w-100"
						{...props}
						onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
							if (e.key === 'Enter') e.currentTarget.blur()
						}}
					/>
				)}
				{notice}
			</div>
		</PropertyField>
	)
}

export interface PagePropertiesPanelProps {
	client: RtdbClient | undefined
	pageId: string | undefined
	/** Live title, so the derived slug follows a rename without a re-read. */
	title: string
	/**
	 * Live from the page map, so a publish landing under an open pane is seen. The
	 * `record` below is a one-shot read taken at mount (`usePageProperties`), and
	 * `freezePublishedPages` writes both of these after it.
	 */
	publishedAt?: string
	/** Live for the same reason. `null` is "the author cleared it", not "absent". */
	liveSlug?: string | null
	/** What the SEO fields would say with nothing filled in. */
	derived: DerivedPageMeta
	/**
	 * The page sits at the top of its **document**, where the container's own
	 * generated entries (`index`, `tags`, `404`, `_site`) live — in every mount
	 * position, so this does not depend on where the document is mounted.
	 */
	atContainerRoot: boolean
	/**
	 * The page sits at the top of the **site**, where the names the node itself
	 * serves live. That needs the mount path, which this pane does not have; the
	 * publish gate does, and it is the copy that blocks a publish.
	 */
	atRoot: boolean
	/**
	 * This page is the document's home page: it is served at the mount root, has no
	 * address of its own, and cannot be a draft or a nav entry.
	 */
	isHome: boolean
	/**
	 * The page could become the home page — the document publishes as a website and
	 * this page sits at the top level. False hides the offer rather than disabling
	 * it, the same rule the DocBar menu follows.
	 */
	canBecomeHome: boolean
	/** Set this page as the home page, or clear it (`isHome`). */
	onToggleHome: () => void
	readOnly: boolean
}

/**
 * The site fields of one page, as a pane beside the editor.
 *
 * `pubAt` is shown but not editable — the publisher writes it.
 *
 * Empty fields show what they would produce rather than nothing, so the author
 * can see what will be published without filling anything in.
 */
export function PagePropertiesPanel({
	client,
	pageId,
	title,
	publishedAt,
	liveSlug,
	derived,
	atContainerRoot,
	atRoot,
	isHome,
	canBecomeHome,
	onToggleHome,
	readOnly
}: PagePropertiesPanelProps) {
	const { t } = useTranslation()
	const { record, loading, error, retry, save } = usePageProperties(client, pageId)

	// A refused write leaves the control snapped back to the stored value with
	// nothing on screen to explain it, so it has to be said.
	const [saveError, setSaveError] = React.useState<string | undefined>()
	const commit = React.useCallback(
		(patch: PageUpdate) => {
			setSaveError(undefined)
			save(patch).catch((err) => {
				console.error('[Notillo] Page property save failed:', err)
				setSaveError(err instanceof Error ? err.message : String(err))
			})
		},
		[save]
	)

	// The address is derived from the title until the page is first published and
	// frozen from then on, so a rename cannot move a live URL behind the
	// author's back. Clearing the field is what resumes derivation, and that is
	// exactly what a published page must not do.
	//
	// The live prop first: `record` was read once, at mount, so a publish that
	// landed while this pane stayed open is only visible on the page map.
	const frozen = (publishedAt ?? record?.publishedAt) !== undefined
	const [slugNotice, setSlugNotice] = React.useState<string | undefined>()
	const commitSlug = React.useCallback(
		(value: string | null) => {
			if (value === null) {
				if (frozen) {
					setSlugNotice(
						t('A published page keeps its address — type a new one to move it.')
					)
					return
				}
				setSlugNotice(undefined)
				commit({ slug: null })
				return
			}
			// Refused rather than silently rewritten: the field keeps what was typed
			// with the reason under it, so the fix is one keystroke away.
			const problem = slugProblem(value)
			if (problem) {
				setSlugNotice(
					problem === 'chars'
						? t('Use lowercase letters, digits and dashes only.')
						: t('A slug cannot start or end with a dash.')
				)
				return
			}
			setSlugNotice(undefined)
			commit({ slug: value })
		},
		[commit, frozen, t]
	)

	// Keyed by the closed set, like `reservedText` below: a third archetype is then
	// a type error here rather than a silently label-less option in the select.
	const archetypeLabels: Record<SiteArchetypeName, string> = {
		page: t('Page'),
		post: t('Post')
	}

	if (loading) {
		return (
			<div className="c-vbox fill align-items-center justify-content-center">
				<LoadingSpinner />
			</div>
		)
	}

	if (error) {
		return (
			<div className="c-vbox g-2 p-3">
				<div className="c-alert error" role="alert">
					{t('Could not load this page’s settings.')}
				</div>
				<Button onClick={retry}>{t('Try again')}</Button>
			</div>
		)
	}

	if (!record) {
		return <div className="p-3 text-muted text-sm">{t('Select a page.')}</div>
	}

	const derivedSlug = slugify(title) || undefined
	// The warning follows the address the page would actually publish under, so a
	// derived slug is checked too — the author never typed it, but the publish
	// endpoint will still refuse it.
	// `!== undefined`, never `??`: `null` is "the author cleared it" and is a value
	// the live map carries, so it must win over the one-shot read rather than fall
	// through to it. Same reason `freezePublishedPages`' slug is read from here.
	const storedSlug = liveSlug !== undefined ? liveSlug : record.slug
	const effectiveSlug = storedSlug ?? derivedSlug
	const reserved = effectiveSlug
		? reservedSlugReason(effectiveSlug, { atRoot, atContainerRoot })
		: undefined
	const reservedText: Record<ReservedReason, string> = {
		site: t('This address belongs to Cloudillo itself — publishing will refuse it.'),
		container: t('This address belongs to the site builder — publishing will refuse it.')
	}
	const slugMessage = slugNotice ?? (reserved ? reservedText[reserved] : undefined)
	const slugNoticeNode = slugMessage ? (
		<div className="text-xs text-error">{slugMessage}</div>
	) : undefined
	return (
		<div className="c-vbox g-2 p-2 flex-fill" style={{ overflowY: 'auto' }}>
			{saveError && (
				<div className="c-alert error" role="alert">
					{t('Could not save: {{error}}', { error: saveError })}
				</div>
			)}
			<PropertySection title={t('Publishing')}>
				{isHome && (
					<div className="c-hbox align-items-center g-2">
						<IcHome />
						<span className="fill text-sm">{t('Home page')}</span>
						{!readOnly && (
							<Button size="small" onClick={onToggleHome}>
								{t('Remove as home page')}
							</Button>
						)}
					</div>
				)}
				{!isHome && canBecomeHome && !readOnly && (
					<div className="c-hbox align-items-center g-2">
						<IcHome />
						<span className="fill text-sm text-muted">{t('Not your home page.')}</span>
						<Button size="small" onClick={onToggleHome}>
							{t('Set as home page')}
						</Button>
					</div>
				)}
				{isHome ? (
					// The home page is served at the mount root, which has no path
					// segment — there is nothing here to type into.
					<PropertyField label={t('Slug')} labelWidth={LABEL_WIDTH}>
						<div className="c-vbox g-1 w-100">
							<Input className="w-100" value="/" readOnly disabled />
							<div className="text-xs text-muted">
								{t('Your home page has no address of its own.')}
							</div>
						</div>
					</PropertyField>
				) : (
					<TextProperty
						label={t('Slug')}
						value={storedSlug}
						placeholder={derivedSlug}
						readOnly={readOnly}
						notice={slugNoticeNode}
						onCommit={commitSlug}
					/>
				)}
				<ArchetypeSelect
					label={t('Type')}
					value={record.kind}
					emptyLabel={t('Inherited (page)')}
					labels={archetypeLabels}
					readOnly={readOnly}
					onChange={(kind) => commit({ kind })}
				/>
				{/* What a new child of this page is created as, and what a child that
				    names no type of its own publishes as. One level only — a
				    grandchild asks its own parent. */}
				<ArchetypeSelect
					label={t('New child type')}
					value={record.childKind}
					emptyLabel={t('Page (default)')}
					labels={archetypeLabels}
					readOnly={readOnly}
					onChange={(childKind) => commit({ childKind })}
				/>
				<Toggle
					checked={!!record.draft}
					disabled={readOnly || isHome}
					label={t('Draft — keep off the published site')}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						commit({ draft: e.target.checked || null })
					}
				/>
				{isHome && (
					// The publish gate refuses a drafted home page by name
					// (`homeDraft`), so this says the same thing one step earlier.
					<div className="text-xs text-muted">
						{t('Your home page cannot be a draft.')}
					</div>
				)}
				{record.draft && !isHome && (
					<div className="text-xs text-muted">
						{t('Its subpages stay off the site too, even when they are not drafts.')}
					</div>
				)}
				{/* The home page is the site's front door, not one of the links beside
				    the others — there is no navigation for it to be hidden from. */}
				{!isHome && (
					<Toggle
						checked={!!record.noNav}
						disabled={readOnly}
						label={t('Hide from navigation')}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							commit({ noNav: e.target.checked || null })
						}
					/>
				)}
				<div className="text-xs text-muted">
					{record.publishedAt
						? t('First published {{date}}', {
								date: record.publishedAt.slice(0, 10)
							})
						: t('Not published yet.')}
				</div>
			</PropertySection>
			<PropertySection title={t('Metadata')}>
				<TextProperty
					label={t('Author')}
					value={record.author}
					placeholder={t('Site owner')}
					readOnly={readOnly}
					onCommit={(author) => commit({ author })}
				/>
				<TextProperty
					label={t('Description')}
					value={record.desc}
					placeholder={derived.description}
					readOnly={readOnly}
					multiline
					onCommit={(desc) => commit({ desc })}
				/>
				<TextProperty
					label={t('Social image')}
					value={record.image}
					placeholder={derived.image ?? t('First image on the page')}
					readOnly={readOnly}
					onCommit={(image) => commit({ image })}
				/>
				<div className="text-xs text-muted">
					{t('Left empty, these are taken from the page itself.')}
				</div>
			</PropertySection>
		</div>
	)
}

// vim: ts=4
