// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `index` block's settings, *as* the floating formatting toolbar.
 *
 * Not a gear opening a panel: the controls sit inline in the bar, because for a
 * `content: 'none'` block the bar is otherwise empty. Every stock item hides itself
 * here — the `File*` buttons fail their `blockHasType(…, { url: 'string' })` check,
 * the style/link/nest buttons bail on "no selected block has inline content",
 * `TextAlignButton` wants a `textAlignment` prop and `BlockTypeSelect` does not list
 * `index` — so these selects compete with nothing. Like BlockNote's own file-block
 * controls, the whole set selects itself out of existence (`useEditorState` returns
 * `undefined`, the component returns `null`) unless a single `index` block is
 * selected, after which `.bn-toolbar:empty` hides the bar itself.
 *
 * **The trap this file exists to avoid.** Mantine's `ToolbarSelect` (`ToolbarSelect.tsx:25-28`)
 * renders `null` when no item is `isSelected`. A block stored with `limit: 7` — outside
 * the offered presets — or a `tag` no page carries any more would therefore make that
 * dropdown *vanish* from the toolbar rather than merely show something wrong: the
 * author could neither see the value nor change it. `selectItems` injects the current
 * value as its own item whenever the offered set lacks it, and the tag select does the
 * same for its empty and no-tags states. Do not "simplify" that away.
 *
 * `ToolbarSelect` also runs `assertEmpty(rest)` — only `className`, `items` and
 * `isDisabled` may be passed, so there is no label or tooltip — and keys its menu rows
 * by `item.text`. Hence one icon per category as the trigger's only cue, and unique
 * texts within a select.
 *
 * `root` is deliberately not exposed. There is no page picker in the editor and a raw
 * pageId field is not a usable control; `siteListingQuery` still reads the prop and
 * `selectListing` still honours it, so a listing that needs one can be built by other
 * means.
 */

import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core'
import {
	type ComponentProps,
	useBlockNoteEditor,
	useComponentsContext,
	useEditorState
} from '@blocknote/react'
import type { SiteListingLayout, SiteListingQuery, SiteListingSort } from '@cloudillo/core'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	RiExpandUpDownLine,
	RiFileListLine,
	RiFilterLine,
	RiFontSize,
	RiGalleryLine,
	RiLayoutRowLine,
	RiMenuLine,
	RiNodeTree,
	RiParentLine,
	RiPriceTag3Line,
	RiRssLine,
	RiSortAsc,
	RiSortDesc,
	RiStackLine
} from 'react-icons/ri'

import { collectTags } from '../hooks/useTags.js'
import { siteListingQuery } from '../publish/listing.js'
import {
	LISTING_LAYOUTS,
	LISTING_SORTS,
	LISTING_SOURCES,
	layoutLabel,
	sortLabel,
	sourceLabel
} from './index-labels.js'
import { useNotilloEditor } from './NotilloEditorContext.js'

type SelectItem = ComponentProps['FormattingToolbar']['Select']['items'][number]

/** What `BlockTypeSelect` renders its icons at, so this bar matches the stock one. */
const ICON_SIZE = 16

// Presets rather than number inputs: a toolbar row has no space for a spinner, and
// these cover what a listing is realistically capped or nested to. A stored value
// outside them is still shown and kept — see `selectItems`.
const DEPTHS: readonly number[] = [0, 1, 2, 3, 4, 5]
const LIMITS: readonly number[] = [0, 5, 10, 20, 50]

// Keyed on the full union rather than switched with a `default:`. Everything shown
// here has been through `siteListingQuery`'s decode, so a plain index is safe — and
// a member added to the closed set becomes a compile error here rather than silently
// wearing the first case's icon. `index-labels.ts` keeps its switches: a raw stored
// prop reaches those.
const SOURCE_ICONS: Record<SiteListingQuery['source'], React.ReactNode> = {
	children: <RiParentLine size={ICON_SIZE} />,
	subtree: <RiNodeTree size={ICON_SIZE} />,
	siblings: <RiStackLine size={ICON_SIZE} />,
	tag: <RiPriceTag3Line size={ICON_SIZE} />,
	all: <RiFileListLine size={ICON_SIZE} />
}

const SORT_ICONS: Record<SiteListingSort, React.ReactNode> = {
	'date-desc': <RiSortDesc size={ICON_SIZE} />,
	'date-asc': <RiSortAsc size={ICON_SIZE} />,
	title: <RiFontSize size={ICON_SIZE} />,
	order: <RiNodeTree size={ICON_SIZE} />
}

const LAYOUT_ICONS: Record<SiteListingLayout, React.ReactNode> = {
	list: <RiLayoutRowLine size={ICON_SIZE} />,
	compact: <RiMenuLine size={ICON_SIZE} />,
	tree: <RiNodeTree size={ICON_SIZE} />,
	cards: <RiGalleryLine size={ICON_SIZE} />
}

/**
 * One toolbar select's items, with the current value guaranteed to be among them — an
 * off-menu value is prepended as its own item. See the `ToolbarSelect` trap above.
 */
function selectItems<V>(
	options: readonly V[],
	current: V,
	label: (value: V) => string,
	icon: React.ReactNode | ((value: V) => React.ReactNode),
	pick: (value: V) => void
): SelectItem[] {
	const values = options.includes(current) ? options : [current, ...options]
	return values.map((value) => ({
		text: label(value),
		icon: typeof icon === 'function' ? icon(value) : icon,
		isSelected: value === current,
		onClick: () => pick(value)
	}))
}

export function IndexToolbarItems() {
	const { t } = useTranslation()
	const Components = useComponentsContext()!
	const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
	const { pages } = useNotilloEditor()

	const block = useEditorState({
		editor,
		selector: ({ editor }) => {
			if (!editor.isEditable) return undefined
			const selected = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]
			if (selected.length !== 1) return undefined
			return selected[0].type === 'index' ? selected[0] : undefined
		}
	})

	// Prop writes are `hasDiscreteChange` in `useEditorSync`, so they persist at once
	// rather than on the 300 ms body debounce — the same path the old inline row took.
	const update = React.useCallback(
		(patch: Record<string, unknown>) => {
			if (!block) return
			// biome-ignore lint/suspicious/noExplicitAny: BlockNote schema boundary — the generic `BlockSchema` here has no props to check a partial against
			editor.updateBlock(block.id, { props: patch as any })
		},
		[editor, block]
	)

	if (!block) return null

	// The same parser the publisher uses, so what this bar shows is what publishes.
	// Plain expressions rather than `useMemo`: `siteListingQuery` is cheap and this
	// component only renders while an `index` block is selected.
	const query = siteListingQuery({ ...block.props })

	/**
	 * The tag select's items. Two states the generic helper cannot express — no tag
	 * chosen yet, and a document with no tags at all — would otherwise leave the select
	 * with nothing selected, which renders nothing at all.
	 *
	 * A function rather than a value, so the list is built only when that select
	 * renders: `collectTags` walks every page, this component re-renders on every
	 * editor state change, and the select is offered for `source: 'tag'` alone.
	 */
	const tagItemsFor = (currentTag: string): SelectItem[] => {
		const tagIcon = <RiPriceTag3Line size={ICON_SIZE} />
		const tags = [...collectTags(pages).tags].sort()
		const items: SelectItem[] = tags.map((tag) => ({
			text: tag,
			icon: tagIcon,
			isSelected: tag === currentTag,
			onClick: () => update({ tag })
		}))
		if (!currentTag) {
			items.unshift({
				text: t('Choose a tag'),
				icon: tagIcon,
				isSelected: true,
				onClick: () => {}
			})
		} else if (!tags.includes(currentTag)) {
			items.unshift({
				text: currentTag,
				icon: tagIcon,
				isSelected: true,
				onClick: () => {}
			})
		}
		if (!tags.length) {
			items.push({
				text: t('No tags yet'),
				icon: tagIcon,
				isSelected: false,
				isDisabled: true,
				onClick: () => {}
			})
		}
		return items
	}

	// In the order the block's own summary line reads: source · sort · layout · limit.
	return (
		<>
			<Components.FormattingToolbar.Select
				className="bn-select"
				items={selectItems(
					LISTING_SOURCES,
					query.source,
					(source) => sourceLabel(source, t),
					(source) => SOURCE_ICONS[source],
					(source) => update({ source })
				)}
			/>
			{query.source === 'tag' && (
				<Components.FormattingToolbar.Select
					className="bn-select"
					items={tagItemsFor(query.tag ?? '')}
				/>
			)}
			{query.source === 'subtree' && (
				<Components.FormattingToolbar.Select
					className="bn-select"
					items={selectItems(
						DEPTHS,
						query.depth ?? 0,
						(depth) => (depth ? String(depth) : t('All levels')),
						<RiExpandUpDownLine size={ICON_SIZE} />,
						(depth) => update({ depth })
					)}
				/>
			)}
			<Components.FormattingToolbar.Select
				className="bn-select"
				items={selectItems(
					LISTING_SORTS,
					query.sort,
					(sort) => sortLabel(sort, t),
					(sort) => SORT_ICONS[sort],
					(sort) => update({ sort })
				)}
			/>
			<Components.FormattingToolbar.Select
				className="bn-select"
				items={selectItems(
					LISTING_LAYOUTS,
					query.layout,
					(layout) => layoutLabel(layout, t),
					(layout) => LAYOUT_ICONS[layout],
					(layout) => update({ layout })
				)}
			/>
			<Components.FormattingToolbar.Select
				className="bn-select"
				items={selectItems(
					LIMITS,
					query.limit ?? 0,
					(limit) => (limit ? String(limit) : t('No limit')),
					<RiFilterLine size={ICON_SIZE} />,
					(limit) => update({ limit })
				)}
			/>
			<Components.FormattingToolbar.Button
				className="bn-button"
				label={t('Feed')}
				mainTooltip={t('Feed')}
				icon={<RiRssLine size={ICON_SIZE} />}
				isSelected={query.feed === true}
				onClick={() => update({ feed: !query.feed })}
			/>
		</>
	)
}

// vim: ts=4
