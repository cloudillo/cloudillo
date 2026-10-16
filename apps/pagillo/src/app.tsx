// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { docBaseName, getApiUrl } from '@cloudillo/core'
import { downloadYDocExport, initPresence } from '@cloudillo/crdt'
import {
	AppDocBar,
	Button,
	DialogContainer,
	DocBarMenu,
	EmptyState,
	IcExport,
	IcPagillo,
	LoadingSpinner,
	MenuItem,
	PropertyPanel,
	Tab,
	Tabs,
	Toasts,
	useCloudilloEditor,
	useDialog
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'
import './style.css'

import type * as Y from 'yjs'

import { useLandmarks } from './a11y/landmarks'
import { MIRROR_ID, Mirror } from './a11y/Mirror'
import { isEmptyPublication, openPublication } from './crdt/document'
import { frameOf, framesOf, masterOf, sectionOf } from './crdt/entities'
import {
	chainOf,
	chainOfStory,
	soleInlineObject,
	type ThreadState,
	threadAnnouncements,
	threadStates
} from './crdt/frame-ops'
import { registerNormalizer } from './crdt/normalize'
import { moveSection } from './crdt/section-ops'
import { PAGE_SIZES } from './crdt/type-converters'
import { caretBox, selFrom, selTo } from './editor/caret'
import { useClipboard } from './editor/clipboard'
import {
	addPage,
	type CommandCtx,
	deletePage,
	footnoteRef,
	isSectionStory,
	leaveFootnote,
	leaveTable,
	tableAt
} from './editor/commands'
import { useFindReplace } from './editor/FindReplace'
import { type FrameCtl, LINK_REFUSALS, useFrames } from './editor/FrameOverlay'
import { containsPoint, pageMaster } from './editor/frames'
import { handleKey, type KeymapCtx, undoRedoKey } from './editor/keymap'
import { usePublishPresence, useRemote } from './editor/RemoteOverlay'
import { SpellOverlay } from './editor/SpellOverlay'
import { TextMenu } from './editor/TextMenu'
import { useUndo } from './editor/undo'
import { useEditor } from './editor/useEditor'
import { userWords } from './editor/user-words'
import { appLabel } from './embeds/record'
import { EmbedRendersContext, useEmbedRenders } from './embeds/useEmbedRenders'
import { PdfExportDialog } from './export/PdfExportDialog'
import { oversetTarget, type PreflightRow } from './export/preflight'
import { newerEngine, pageKey, useLayout } from './layout/useLayout'
import { FormatPanel } from './panels/FormatPanel'
import { LayoutBanner, LayoutsPanel } from './panels/LayoutEditor'
import { PublicationSettings } from './panels/PublicationSettings'
import { StylesPanel } from './panels/StylesPanel'
import { TemplateGallery } from './panels/TemplateGallery'
import { Toolbar } from './toolbar/Toolbar'
import { Banners, EngineStopped } from './view/Banners'
import { flattenPages, PageList, scrollToPage, type Zoom } from './view/PageList'
import { useEmptyImages } from './view/PageSvg'
import { PagesRail } from './view/PagesRail'
import { SectionPopover } from './view/SectionPopover'
import { type ModeInfo, StatusBar } from './view/StatusBar'

declare const __APP_VERSION__: string

/** Touch-only devices open read-only. */
const TOUCH_ONLY = '(hover: none) and (pointer: coarse)'

type PanelTab = 'format' | 'styles'

export function PagilloApp() {
	const { t } = useTranslation()
	const cl = useCloudilloEditor('pagillo')
	const { yDoc, provider, synced, error, access, ownerTag, token } = cl
	const doc = React.useMemo(() => openPublication(yDoc), [yDoc])
	const writer = access === 'write'
	const layout = useLayout(synced ? yDoc : undefined, { synced, canWrite: writer })

	const [touchOnly] = React.useState(() => window.matchMedia(TOUCH_ONLY).matches)
	const [touchEdit, setTouchEdit] = React.useState(false)
	/** Editing allowed in the UI. */
	const canEdit = writer && !layout.readOnlyReason && (!touchOnly || touchEdit)
	/** Layout/style panels: touch devices only ever get text editing. */
	const canLayout = canEdit && !touchOnly
	const undo = useUndo(yDoc, doc, synced)
	const dialog = useDialog()
	/** Latest keymap context (the editor is created below, its key handler reads this). */
	const keyCtx = React.useRef<KeymapCtx | undefined>(undefined)
	/** Frame layer (created below): Esc in a text box selects the box. */
	const framesRef = React.useRef<FrameCtl | undefined>(undefined)
	/** Esc fallback: leave Edit layout (set while the mode is on and nothing is selected). */
	const escRef = React.useRef<(() => void) | undefined>(undefined)
	/** Pages rail scroller: auto-scrolls during a frame move drag. */
	const railRef = React.useRef<HTMLElement>(null)
	// Writers get the input adapter even under `readOnlyReason`: it refuses edits (onRefusedEdit).
	const canInput = writer && (!touchOnly || touchEdit)
	const editor = useEditor({
		yDoc,
		doc,
		layout,
		canInput,
		label: t('Document text'),
		onKey: (e) =>
			((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && openTextMenu()) ||
			(e.key === 'Escape' &&
				!!keyCtx.current &&
				(leaveTable(keyCtx.current) || leaveFootnote(keyCtx.current))) ||
			!!framesRef.current?.fromText(e) ||
			(keyCtx.current ? handleKey(e, keyCtx.current) : false)
	})
	const cmd: CommandCtx = { yDoc, doc, editor }
	keyCtx.current = { ...cmd, undo, canEdit }
	const find = useFindReplace({ yDoc, doc, editor, layout, canEdit })
	const [textMenu, setTextMenu] = React.useState<{ x: number; y: number }>()
	/** Shift+F10 / Menu key: the text menu at the caret. */
	const openTextMenu = () => {
		if (!editor.sel || framesRef.current?.sel) return false
		const r = editor.caretRect()
		setTextMenu(r ? { x: r.left, y: r.bottom } : { x: innerWidth / 2, y: innerHeight / 2 })
		return true
	}

	// Story normaliser (bids): writers only, and never while an older engine is read-only.
	const canNormalize = React.useRef(false)
	canNormalize.current = writer && !layout.readOnlyReason
	const normalizer = React.useRef<{ run(): void } | undefined>(undefined)
	React.useEffect(() => {
		if (!synced) return
		// `readOnlyReason` lands a render after sync: re-check the skew synchronously.
		const n = registerNormalizer(yDoc, doc, () => canNormalize.current && !newerEngine(doc))
		normalizer.current = n
		return () => {
			n.dispose()
			normalizer.current = undefined
		}
	}, [yDoc, doc, synced])
	React.useEffect(() => {
		// Access upgrade or skew cleared: fix whatever piled up meanwhile.
		if (writer && !layout.readOnlyReason) normalizer.current?.run()
	}, [writer, layout.readOnlyReason])

	React.useEffect(() => {
		if (!provider) return
		initPresence(provider.awareness, {
			idTag: cl.idTag,
			displayName: cl.displayName,
			authenticated: cl.authenticated
		})
	}, [provider, cl.idTag, cl.displayName, cl.authenticated])

	// Undo/redo fallback: keys no editor or frame layer handled, e.g. after drawing a text
	// area in Edit layout (focus is on neither). Form fields keep their own undo.
	// Esc with nothing selected leaves Edit layout; dialogs and menus keep their own Esc.
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const c = keyCtx.current
			if (e.defaultPrevented || e.altKey) return
			const el = e.target instanceof Element ? e.target : undefined
			const field = el?.closest(
				'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
			)
			if (e.key === 'Escape') {
				const leave = escRef.current
				if (leave && !field && !el?.closest('[role="dialog"], [role="menu"]')) {
					e.preventDefault()
					leave()
				}
				return
			}
			const k = !field && undoRedoKey(e)
			if (!c?.canEdit || !k) return
			e.preventDefault()
			c.undo[k]()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [])

	// Gallery visibility follows `secs`, so a collaborator's template apply closes it.
	const subscribeSecs = React.useCallback(
		(cb: () => void) => {
			doc.secs.observe(cb)
			return () => doc.secs.unobserve(cb)
		},
		[doc]
	)
	const empty = React.useSyncExternalStore(subscribeSecs, () => isEmptyPublication(doc))

	const [zoom, setZoom] = React.useState<Zoom>(touchOnly ? 'width' : 100)
	const [zoomPct, setZoomPct] = React.useState(100)
	const [current, setCurrent] = React.useState(0)
	const [tab, setTab] = React.useState<PanelTab>('format')
	const [secPop, setSecPop] = React.useState<{ id: string; el: HTMLElement }>()
	const [layoutEdit, setLayoutEdit] = React.useState<string>()
	/** Undo depth and edited layout on entering Edit layout: Discard returns there. */
	const [layoutBase, setLayoutBase] = React.useState<{ depth: number; master: string }>()
	const [pubSettings, setPubSettings] = React.useState(false)
	const [pdfOpen, setPdfOpen] = React.useState(false)
	const awareness = provider?.awareness
	const remote = useRemote({ awareness, yDoc, doc, editor, layout })
	const src = React.useMemo(() => ({ ownerTag, token }), [ownerTag, token])
	const embeds = useEmbedRenders(doc, cl.fileId)
	const frames = useFrames({
		yDoc,
		doc,
		editor,
		layout,
		canEdit: canLayout,
		layoutEdit: canLayout ? layoutEdit : undefined,
		fileId: cl.fileId,
		current,
		onKey: (e) => (keyCtx.current ? handleKey(e, keyCtx.current) : false),
		locked: remote.locked,
		src,
		embeds
	})
	// A pasted `cl:` ref is an inline embed (needs layout rights, as Insert › Embed… does).
	useClipboard(cmd, {
		sourceFileId: cl.fileId,
		onLink: canLayout ? (link, owner) => frames.insertEmbed(true, link, owner) : undefined,
		canLink: (appId) => frames.canInsertEmbed(true, appId)
	})
	// Spell checking follows View › Check spelling (writers only); the user's words load once.
	const spellOn = canEdit && frames.view.spell
	const { setSpell } = layout
	React.useEffect(() => {
		setSpell(spellOn)
	}, [spellOn, setSpell])
	React.useEffect(() => {
		userWords()
			.then((w) => setSpell(undefined, w))
			.catch(() => {})
	}, [setSpell])
	framesRef.current = frames
	usePublishPresence(awareness, doc, {
		sel: editor.sel,
		frames: frames.sel,
		active: frames.active,
		layout: layoutEdit,
		page: current
	})
	useLandmarks(() => {
		if (canInput) editor.focus()
		else document.getElementById(MIRROR_ID)?.focus()
	})
	/** Laid-out page count per page layout (master id). */
	const layoutUsage = new Map<string, number>()
	for (const p of layout.pages.values()) {
		layoutUsage.set(p.page.master, (layoutUsage.get(p.page.master) ?? 0) + 1)
	}
	const layoutPages = layoutEdit ? (layoutUsage.get(layoutEdit) ?? 0) : 0
	const emptyImages = useEmptyImages(synced ? doc : undefined)
	const defaultPage = (doc.m.get('page') as { w: number; h: number } | undefined) ?? PAGE_SIZES.A4
	const handleExport = React.useCallback(() => {
		downloadYDocExport(
			yDoc,
			(doc.m.get('title') as string | undefined) || docBaseName() || 'untitled',
			{
				contentType: 'application/vnd.cloudillo.pagillo+json',
				appVersion: __APP_VERSION__,
				formatVersion: '1.0.0',
				extension: 'pagillo'
			}
		)
	}, [yDoc, doc])
	const curRef = flattenPages(layout.sections)[current]
	const curMaster = curRef && layout.pages.get(curRef.key)?.page.master
	// Edit layout follows the current page: navigating or re-assigning switches the edited layout.
	React.useEffect(() => {
		if (layoutEdit && curMaster) setLayoutEdit(curMaster)
	}, [curMaster])

	/** Scroll to the row's page (its frame's, if anchored to one) and select the frame. */
	const jumpTo = (r: Pick<PreflightRow, 'page' | 'frame'>) => {
		const f = r.frame ? frameOf(doc, r.frame) : undefined
		const key = f && 'sec' in f.anchor ? pageKey(f.anchor.sec, f.anchor.page) : r.page
		if (key) scrollToPage(key)
		const p = r.frame ? frames.pageOf(r.frame) : -1
		if (r.frame && p >= 0) frames.select({ ids: [r.frame], page: p })
	}

	const onOverset = () => {
		const target = oversetTarget(layout)
		if (target) jumpTo(target)
	}

	/** Preflight Jump: close the export dialog, then jump. */
	const onPdfJump = (r: PreflightRow) => {
		setPdfOpen(false)
		jumpTo(r)
	}

	/** One-off live-region announcement (cleared after a while so the same text can repeat). */
	const [said, setSaid] = React.useState<string>()
	React.useEffect(() => {
		if (!said) return
		const id = setTimeout(() => setSaid(undefined), 3000)
		return () => clearTimeout(id)
	}, [said])
	// Thread announcements: a local frame edit (link, delete, Stop text after this frame) is
	// compared per story across the next settled layout. Undo/remote edits use other origins.
	const localFrameEdit = React.useRef(false)
	React.useEffect(() => {
		const on = (_e: unknown, tr: Y.Transaction) => {
			if (tr.origin === yDoc.clientID) localFrameEdit.current = true
		}
		doc.f.observeDeep(on)
		return () => doc.f.unobserveDeep(on)
	}, [yDoc, doc])
	const prevThreads = React.useRef<Map<string, ThreadState>>(undefined)
	React.useEffect(() => {
		if (!synced || layout.pending) return
		const now = threadStates(doc, layout.overset)
		const prev = prevThreads.current
		prevThreads.current = now
		if (!prev || !localFrameEdit.current) return
		localFrameEdit.current = false
		for (const a of threadAnnouncements(prev, now))
			setSaid(
				a.kind === 'linked'
					? t('Linked · frame {{n}} of {{m}}', { n: a.m, m: a.m })
					: t('Text no longer fits · Ctrl+Z to undo')
			)
	}, [synced, layout.pending, layout.overset])

	if (error) {
		return <EmptyState icon={<IcPagillo />} title={t('Connection Error')} />
	}
	if (!synced) return <LoadingSpinner />

	const panels = { yDoc, doc }
	/** Caret's frame in a threaded story: its text changes (→ announced) when the caret crosses frames. */
	const caretFrame = (() => {
		const es = editor.sel
		if (!es) return
		const c = chainOfStory(doc, es.story)
		if (!c || c.frames.length < 2) return
		const cb = caretBox(editor.index.stories.get(es.story) ?? [], es.head)
		if (!cb) return
		const y = (cb.top + cb.bottom) / 2
		const n = c.frames.findIndex((id) => {
			const f = frameOf(doc, id)
			return !!f && frames.pageOf(id) === cb.page && containsPoint({ ...f, rot: 0 }, cb.x, y)
		})
		return n < 0 ? undefined : { n: n + 1, m: c.frames.length }
	})()
	/** Announced by the a11y mirror's live region when they appear. */
	const notices = [
		caretFrame && t('Frame {{n}} of {{m}}', caretFrame),
		said,
		layout.readOnlyReason &&
			t('This document is read-only: it needs a newer version of Pagillo'),
		layout.fontsChanged && t('Fonts changed since this document was laid out'),
		layout.overset.length > 0 && t('Some text does not fit on the pages'),
		layoutEdit && t('Editing page layout')
	].filter((n): n is string => typeof n === 'string')
	const leaveLayout = () => {
		setLayoutEdit(undefined)
		setLayoutBase(undefined)
		editor.focus()
	}
	escRef.current = frames.activeEmbed
		? frames.deactivate
		: frames.link
			? frames.endLink
			: layoutEdit && !frames.sel
				? leaveLayout
				: undefined
	/** Enter (or switch) Edit layout; the Discard baseline is taken on entering only. */
	const enterLayout = (m: string) => {
		if (!layoutEdit) setLayoutBase({ depth: undo.mark(), master: m })
		setLayoutEdit(m)
	}
	const discardLayout = () => {
		if (!layoutBase) return
		undo.undoTo(layoutBase.depth)
		// Discard may undo the creation of the layout being edited.
		if (layoutEdit && !doc.ms.has(layoutEdit)) setLayoutEdit(layoutBase.master)
	}
	/** Edit the page layout (master) of global page `n` (rail menu). */
	const editLayoutOf = (n: number) => {
		const key = flattenPages(layout.sections)[n]?.key
		const m = key && layout.pages.get(key)?.page.master
		if (m) enterLayout(m)
	}
	/** Blast radius for the banner: sections with pages using the edited layout, current side. */
	const layoutScope = (() => {
		if (!layoutEdit) return
		const secs = doc.secs.toArray()
		const refs = flattenPages(layout.sections)
		const used = refs.filter((r) => layout.pages.get(r.key)?.page.master === layoutEdit)
		const page = refs[current] && layout.pages.get(refs[current].key)?.page
		return {
			sections: [...new Set(used.map((r) => secs.indexOf(r.sec) + 1))],
			side: page?.master === layoutEdit ? pageMaster(doc, page)?.side : undefined
		}
	})()
	/** Current page's section and layout for the empty Format tab. */
	const curPage = curRef && {
		id: curRef.sec,
		which: curRef.index === 0 ? ('first' as const) : ('rest' as const),
		sec: doc.secs.toArray().indexOf(curRef.sec) + 1,
		layoutName: (curMaster && masterOf(doc, curMaster)?.name) || ''
	}
	/** Status-bar mode chip + key hints; `spoken` keeps the full sentence. */
	const mode = (): ModeInfo => {
		if (frames.link) {
			const r = frames.linkRefusal
			return {
				chip: t('Linking text'),
				// While hovering a refused frame, its reason replaces the hints (no key).
				hints: r
					? [['', t(LINK_REFUSALS[r])]]
					: [
							[t('Click'), t('an empty text box')],
							[t('Drag'), t('draw one')],
							[t('Esc'), t('cancel')]
						],
				spoken: t(
					'Linking text · click an empty text box or drag to draw one · Esc cancels'
				)
			}
		}
		const ae = frames.activeEmbed
		if (ae) {
			const app = appLabel(ae.appId)
			return {
				chip: t('Editing in {{app}}', { app }),
				hints: [[t('Esc'), t('done')]],
				spoken: t('Editing the embedded {{app}} content · Esc or Done returns', { app })
			}
		}
		if (frames.crop)
			return {
				chip: t('Cropping'),
				hints: [
					[t('Drag'), t('move image')],
					[t('Enter'), t('done')]
				],
				spoken: t(
					'Cropping the image · drag to move it · corners zoom · Enter or Esc finishes'
				)
			}
		if (layoutEdit)
			return {
				chip: t('Page layout'),
				hints: [[t('Drag'), t('draw text area')]],
				spoken: t('Editing page layout · Done in the banner returns to text')
			}
		const fs = frames.sel
		if (fs) {
			const kind = fs.ids.length === 1 ? frameOf(doc, fs.ids[0])?.t : undefined
			if (kind === 'img')
				return {
					chip: t('Image · on page'),
					hints: [
						[t('Drag'), t('move')],
						[t('Del'), t('delete')],
						[t('Esc'), t('text')]
					],
					spoken: t(
						'Image on the page · drag to move · Delete removes · Esc returns to text'
					)
				}
			if (kind === 'emb')
				return {
					chip: t('Embed · on page'),
					hints: [
						[t('Enter'), t('edit')],
						[t('Drag'), t('move')],
						[t('Del'), t('delete')]
					],
					spoken: t('Embed on the page · Enter edits it · drag to move · Delete removes')
				}
			if (kind === 'txt') {
				const c = chainOf(doc, fs.ids[0])
				const nm = c && { n: c.frames.indexOf(fs.ids[0]) + 1, m: c.frames.length }
				return {
					chip: nm ? t('Text box · {{n}} of {{m}}', nm) : t('Text box'),
					hints: [
						[t('Enter'), t('edit text')],
						[t('Esc'), t('text')]
					],
					spoken: nm
						? t(
								'Text box {{n}} of {{m}} selected · Enter edits its text · Esc returns to text',
								nm
							)
						: t('Text box selected · Enter edits its text · Esc returns to text')
				}
			}
			return {
				chip: t('{{n}} items', { n: fs.ids.length }),
				hints: [
					[t('Shift+click'), t('add')],
					[t('Esc'), t('text')]
				],
				spoken: t('{{n}} items selected · Esc returns to text', { n: fs.ids.length })
			}
		}
		const es = editor.sel
		if (!es)
			return {
				chip: t('Text'),
				hints: [[t('Click'), t('place caret')]],
				spoken: t('Click text to type, or an image or box to select it')
			}
		const tx = doc.tx.get(es.story)
		const obj = tx && soleInlineObject(tx, selFrom(es), selTo(es))
		if (obj?.kind === 'img')
			return {
				chip: t('Image · in text'),
				hints: [[t('Del'), t('delete')]],
				spoken: t('Image in the text · Format › Position puts it on the page')
			}
		if (obj?.kind === 'emb')
			return {
				chip: t('Embed · in text'),
				hints: [
					[t('Enter'), t('edit')],
					[t('Del'), t('delete')]
				],
				spoken: t('Embed in the text · Enter edits it · Delete removes it')
			}
		if (tx && tableAt(tx, selFrom(es)))
			return {
				chip: t('Table cell'),
				hints: [
					[t('Tab'), t('next cell')],
					[t('Shift+Tab'), t('previous')],
					[t('Esc'), t('text')]
				],
				spoken: t(
					'Typing in a table cell · Tab moves to the next cell, Shift+Tab to the previous · Esc leaves the table'
				)
			}
		for (const [, f] of framesOf(doc)) {
			if (f.t === 'txt' && (f.data as { story?: string } | undefined)?.story === es.story)
				return {
					chip: t('Text box'),
					hints: [[t('Esc'), t('select box')]],
					spoken: t('Typing in a text box · Esc selects the box')
				}
		}
		if (!isSectionStory(doc, es.story) && footnoteRef(doc, es.story))
			return {
				chip: t('Footnote'),
				hints: [[t('Esc'), t('back to text')]],
				spoken: t('Typing a footnote · Esc returns to its reference in the text')
			}
		return {
			chip: t('Text'),
			hints: [[t('Esc'), t('leave text')]],
			spoken: t('Typing · Esc leaves the text')
		}
	}
	/** Main story of global page `n`. */
	const pageStory = (n: number) => {
		const p = flattenPages(layout.sections)[n]
		return p && sectionOf(doc, p.sec)?.story
	}
	const onAddPage = (n: number) => {
		const story = pageStory(n)
		if (story) addPage(cmd, story, n)
		editor.focus()
	}
	const onDeletePage = async (n: number) => {
		const story = pageStory(n)
		if (!story) return
		const ok = await dialog.confirm(
			t('Delete page'),
			t(
				'The text shown on this page is deleted. The text after it flows up, so the following pages change too.'
			),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (ok) deletePage(cmd, story, n)
	}

	return (
		<div className="c-vbox pagillo-app">
			<AppDocBar awareness={awareness} provider={provider} onUserClick={remote.scrollTo}>
				{touchOnly && writer && !touchEdit && !layout.readOnlyReason && (
					<Button
						variant="link"
						title={t('Enable text editing on this device')}
						onClick={() => setTouchEdit(true)}
					>
						{t('View only on this device')}
					</Button>
				)}
				{!empty && !layout.failed && (
					<DocBarMenu>
						<MenuItem
							icon={<IcExport />}
							label={t('Export PDF…')}
							onClick={() => setPdfOpen(true)}
						/>
						{canLayout && (
							<MenuItem
								label={t('Publication settings…')}
								onClick={() => setPubSettings(true)}
							/>
						)}
						{canLayout && (
							<MenuItem
								label={t('Page layouts…')}
								onClick={() => editLayoutOf(current)}
							/>
						)}
						<MenuItem label={t('Find…')} onClick={find.open} />
						<MenuItem
							icon={<IcExport />}
							label={t('Export to JSON')}
							onClick={handleExport}
						/>
					</DocBarMenu>
				)}
			</AppDocBar>
			{canEdit && !empty && !layout.failed && (
				<div data-landmark="toolbar" style={{ display: 'contents' }}>
					<Toolbar
						{...cmd}
						undo={undo}
						onInsertImage={
							canLayout ? (inline) => void frames.insertImage(inline) : undefined
						}
						onInsertTextBox={canLayout ? frames.insertTextBox : undefined}
						onInsertEmbed={
							canLayout ? (inline) => void frames.insertEmbed(inline) : undefined
						}
						inlineImageOff={!!layoutEdit || !!frames.sel}
					/>
				</div>
			)}
			<Banners readOnlyReason={layout.readOnlyReason} fontsChanged={layout.fontsChanged} />
			{canLayout && layoutEdit && (
				<LayoutBanner
					doc={doc}
					masterId={layoutEdit}
					pages={layoutPages}
					sections={layoutScope?.sections ?? []}
					side={layoutScope?.side}
					canDiscard={!!layoutBase && undo.depth() > layoutBase.depth}
					onDiscard={discardLayout}
					onDone={leaveLayout}
				/>
			)}
			{!empty && !layout.failed && find.bar}
			{layout.failed ? (
				<EngineStopped message={layout.failed} />
			) : empty ? (
				writer && !layout.readOnlyReason ? (
					<TemplateGallery {...panels} />
				) : (
					<EmptyState
						fill
						icon={<IcPagillo />}
						title={t('This publication has no pages yet')}
					/>
				)
			) : (
				<EmbedRendersContext.Provider value={embeds}>
					<div className="c-hbox flex-fill pagillo-main">
						<Mirror doc={doc} editor={editor} layout={layout} notices={notices} />
						<div data-landmark="rail" style={{ display: 'contents' }}>
							<PagesRail
								layout={layout}
								current={current}
								defaultPage={defaultPage}
								src={src}
								onJump={scrollToPage}
								onSection={
									canLayout ? (id, el) => setSecPop({ id, el }) : undefined
								}
								onMoveSection={
									canLayout
										? (id, to) => moveSection(yDoc, doc, id, to)
										: undefined
								}
								onAddPage={canEdit ? onAddPage : undefined}
								onDeletePage={canEdit ? onDeletePage : undefined}
								onEditLayout={canLayout ? editLayoutOf : undefined}
								highlightMaster={canLayout ? layoutEdit : undefined}
								dropTarget={frames.railTarget}
								railRef={railRef}
							/>
						</div>
						<div data-landmark="document" style={{ display: 'contents' }}>
							<PageList
								layout={layout}
								zoom={zoom}
								defaultPage={defaultPage}
								src={src}
								canEdit={canEdit}
								emptyImages={emptyImages}
								onCurrent={setCurrent}
								onZoomPct={setZoomPct}
								overlay={(i, size, scale) => (
									<>
										{remote.overlay(i, size, scale)}
										{find.overlay(i, size)}
										{!frames.sel && !layoutEdit && editor.overlay(i, size)}
										{spellOn && !frames.sel && !layoutEdit && (
											<SpellOverlay
												w={size.w}
												h={size.h}
												lines={editor.index.pages.get(i)}
												spell={layout.spell}
											/>
										)}
										{frames.overlay(i, size, scale)}
									</>
								)}
								pinned={editor.caretPage}
								onPagePointer={frames.onPointer}
								onPageContextMenu={(hit, e) => {
									if (frames.sel || layoutEdit || !editor.contextMenu(hit)) return
									e.preventDefault()
									setTextMenu({ x: e.clientX, y: e.clientY })
								}}
								dragScroll={frames.dragScroll}
								dragScrollEls={[railRef]}
							/>
						</div>
						{canLayout && (
							<div data-landmark="panel" style={{ display: 'contents' }}>
								<PropertyPanel width={300}>
									{!layoutEdit && (
										<Tabs
											value={tab}
											onTabChange={(v) => setTab(v as PanelTab)}
										>
											<Tab value="format">{t('Format')}</Tab>
											<Tab value="styles">{t('Styles')}</Tab>
										</Tabs>
									)}
									<div className="flex-fill pagillo-panel-scroll">
										{layoutEdit ? (
											<LayoutsPanel
												{...panels}
												masterId={layoutEdit}
												usage={layoutUsage}
												page={
													curPage && {
														sec: curPage.id,
														which: curPage.which
													}
												}
												onSwitch={setLayoutEdit}
											/>
										) : tab === 'format' ? (
											<FormatPanel
												{...panels}
												editor={editor}
												frames={frames}
												page={curPage && { ...curPage, n: current + 1 }}
												onEditLayout={() => editLayoutOf(current)}
												onSectionSettings={(el) =>
													curPage && setSecPop({ id: curPage.id, el })
												}
											/>
										) : (
											<StylesPanel {...panels} />
										)}
									</div>
								</PropertyPanel>
							</div>
						)}
					</div>
				</EmbedRendersContext.Provider>
			)}
			{canLayout && secPop && (
				<SectionPopover
					{...panels}
					secId={secPop.id}
					anchor={secPop.el}
					onClose={() => setSecPop(undefined)}
					onEditLayout={(id) => {
						setSecPop(undefined)
						enterLayout(id)
					}}
				/>
			)}
			{canLayout && pubSettings && (
				<PublicationSettings {...panels} onClose={() => setPubSettings(false)} />
			)}
			{pdfOpen && !layout.failed && (
				<PdfExportDialog
					{...panels}
					layout={layout}
					current={current}
					emptyImages={emptyImages}
					fallbackTitle={docBaseName() ?? 'untitled'}
					files={{ api: getApiUrl(ownerTag), token }}
					writer={writer}
					onJump={onPdfJump}
					onClose={() => setPdfOpen(false)}
				/>
			)}
			{textMenu && (
				<TextMenu
					at={textMenu}
					ctx={cmd}
					layout={layout}
					canEdit={canEdit}
					spell={spellOn}
					onClose={() => setTextMenu(undefined)}
				/>
			)}
			<div data-landmark="status" style={{ display: 'contents' }}>
				<StatusBar
					mode={canEdit ? mode() : undefined}
					view={canEdit ? frames.view : undefined}
					setView={frames.setView}
					current={current}
					pageCount={layout.pageCount}
					pending={layout.pending}
					overset={layout.overset}
					zoom={zoom}
					zoomPct={zoomPct}
					onZoom={setZoom}
					onOverset={onOverset}
				/>
			</div>
			{frames.keyTarget}
			<DialogContainer />
			<Toasts />
		</div>
	)
}

// vim: ts=4
