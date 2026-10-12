// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { initPresence } from '@cloudillo/crdt'
import {
	AppDocBar,
	Button,
	DialogContainer,
	DocBarMenu,
	EmptyState,
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
import { LuFileText as IcPagillo } from 'react-icons/lu'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'
import './style.css'

import { MIRROR_ID, Mirror } from './a11y/Mirror'
import { useLandmarks } from './a11y/landmarks'
import { isEmptyPublication, openPublication } from './crdt/document'
import { soleInlineImage } from './crdt/frame-ops'
import { registerNormalizer } from './crdt/normalize'
import { moveSection } from './crdt/section-ops'
import type { StoredFrame } from './crdt/stored-types'
import { PAGE_SIZES } from './crdt/type-converters'
import { selFrom, selTo } from './editor/caret'
import { useClipboard } from './editor/clipboard'
import { useFindReplace } from './editor/FindReplace'
import { addPage, type CommandCtx, deletePage } from './editor/commands'
import { handleKey, type KeymapCtx, undoRedoKey } from './editor/keymap'
import { pageMaster } from './editor/frames'
import { useUndo } from './editor/undo'
import { useEditor } from './editor/useEditor'
import { type FrameCtl, useFrames } from './editor/FrameOverlay'
import { usePublishPresence, useRemote } from './editor/RemoteOverlay'
import { pageKey, useLayout } from './layout/useLayout'
import { FormatPanel } from './panels/FormatPanel'
import { LayoutBanner, LayoutsPanel } from './panels/LayoutEditor'
import { PublicationSettings } from './panels/PublicationSettings'
import { StylesPanel } from './panels/StylesPanel'
import { TemplateGallery } from './panels/TemplateGallery'
import { Banners, EngineStopped } from './view/Banners'
import { useEmptyImages } from './view/PageSvg'
import { flattenPages, PageList, scrollToPage, type Zoom } from './view/PageList'
import { PagesRail } from './view/PagesRail'
import { SectionPopover } from './view/SectionPopover'
import { type ModeInfo, StatusBar } from './view/StatusBar'
import { Toolbar } from './toolbar/Toolbar'

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
	// Writers get the input adapter even under `readOnlyReason`: it refuses edits (onRefusedEdit).
	const canInput = writer && (!touchOnly || touchEdit)
	const editor = useEditor({
		yDoc,
		doc,
		layout,
		canInput,
		label: t('Document text'),
		onKey: (e) =>
			!!framesRef.current?.fromText(e) ||
			(keyCtx.current ? handleKey(e, keyCtx.current) : false)
	})
	const cmd: CommandCtx = { yDoc, doc, editor }
	keyCtx.current = { ...cmd, undo, canEdit }
	useClipboard(cmd)
	const find = useFindReplace({ yDoc, doc, editor, layout, canEdit })

	// Story normaliser (bids): writers only, and never while an older engine is read-only.
	const canNormalize = React.useRef(false)
	canNormalize.current = writer && !layout.readOnlyReason
	const normalizer = React.useRef<{ run(): void } | undefined>(undefined)
	React.useEffect(() => {
		if (!synced) return
		const n = registerNormalizer(yDoc, doc, () => canNormalize.current)
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
	const awareness = provider?.awareness
	const remote = useRemote({ awareness, yDoc, doc, editor, layout })
	const src = React.useMemo(() => ({ ownerTag, token }), [ownerTag, token])
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
		src
	})
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
	const curRef = flattenPages(layout.sections)[current]
	const curMaster = curRef && layout.pages.get(curRef.key)?.page.master
	// Edit layout follows the current page: navigating or re-assigning switches the edited layout.
	React.useEffect(() => {
		if (layoutEdit && curMaster) setLayoutEdit(curMaster)
	}, [curMaster])

	const onOverset = () => {
		const o = layout.overset[0]
		if (!o) return
		const f = o.frame ? (doc.f.get(o.frame) as StoredFrame | undefined) : undefined
		const pages = layout.sections.find((s) => s.id === o.sec)?.pages ?? 1
		scrollToPage(f ? pageKey(f.anchor.sec, f.anchor.page) : pageKey(o.sec, pages - 1))
	}

	if (error) {
		return <EmptyState icon={<IcPagillo />} title={t('Connection Error')} />
	}
	if (!synced) return <LoadingSpinner />

	const panels = { yDoc, doc }
	/** Announced by the a11y mirror's live region when they appear. */
	const notices = [
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
	escRef.current = layoutEdit && !frames.sel ? leaveLayout : undefined
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
		layoutName: (curMaster && doc.ms.get(curMaster)?.name) || ''
	}
	/** Status-bar mode chip + key hints; `spoken` keeps the full sentence. */
	const mode = (): ModeInfo => {
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
			const kind = fs.ids.length === 1 ? doc.f.get(fs.ids[0])?.t : undefined
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
			if (kind === 'txt')
				return {
					chip: t('Text box'),
					hints: [
						[t('Enter'), t('edit text')],
						[t('Esc'), t('text')]
					],
					spoken: t('Text box selected · Enter edits its text · Esc returns to text')
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
		if (tx && soleInlineImage(tx, selFrom(es), selTo(es)) !== undefined)
			return {
				chip: t('Image · in text'),
				hints: [[t('Del'), t('delete')]],
				spoken: t('Image in the text · Format › Position puts it on the page')
			}
		for (const f of doc.f.values()) {
			if (f.t === 'txt' && (f.data as { story?: string } | undefined)?.story === es.story)
				return {
					chip: t('Text box'),
					hints: [[t('Esc'), t('select box')]],
					spoken: t('Typing in a text box · Esc selects the box')
				}
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
		return p && doc.s.get(p.sec)?.story
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
					</DocBarMenu>
				)}
			</AppDocBar>
			{canEdit && !empty && !layout.failed && (
				<div data-landmark="toolbar" style={{ display: 'contents' }}>
					<Toolbar
						{...cmd}
						undo={undo}
						onInsertImage={canLayout ? () => void frames.insertImage() : undefined}
						onInsertTextBox={canLayout ? frames.insertTextBox : undefined}
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
				<div className="c-hbox flex-fill pagillo-main">
					<Mirror doc={doc} editor={editor} layout={layout} notices={notices} />
					<div data-landmark="rail" style={{ display: 'contents' }}>
						<PagesRail
							layout={layout}
							current={current}
							defaultPage={defaultPage}
							src={src}
							onJump={scrollToPage}
							onSection={canLayout ? (id, el) => setSecPop({ id, el }) : undefined}
							onMoveSection={
								canLayout ? (id, to) => moveSection(yDoc, doc, id, to) : undefined
							}
							onAddPage={canEdit ? onAddPage : undefined}
							onDeletePage={canEdit ? onDeletePage : undefined}
							onEditLayout={canLayout ? editLayoutOf : undefined}
							highlightMaster={canLayout ? layoutEdit : undefined}
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
									{frames.overlay(i, size, scale)}
								</>
							)}
							pinned={editor.caretPage}
							onPagePointer={frames.onPointer}
						/>
					</div>
					{canLayout && (
						<div data-landmark="panel" style={{ display: 'contents' }}>
							<PropertyPanel width={300}>
								{!layoutEdit && (
									<Tabs value={tab} onTabChange={(v) => setTab(v as PanelTab)}>
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
												curPage && { sec: curPage.id, which: curPage.which }
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
