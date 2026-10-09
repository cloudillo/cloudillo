// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

const APP_NAME = 'Calcillo'

declare const __APP_VERSION__: string

import type { Sheet as FortuneSheet, Op } from '@fortune-sheet/core'
import { Workbook, type WorkbookInstance } from '@fortune-sheet/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiLinkBold as IcLink,
	PiTagBold as IcName,
	PiListBulletsBold as IcNames,
	PiExportBold
} from 'react-icons/pi'
import type * as Y from 'yjs'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'
import '@fortune-sheet/react/dist/index.css'
import './style.css'

import { docRef, getAppBus } from '@cloudillo/core'
import {
	AppDocBar,
	DialogContainer,
	DocBarMenu,
	MenuDivider,
	MenuHeader,
	MenuItem,
	Toasts,
	useCloudilloEditor,
	useCopyEmbedLink,
	useDebouncedValue,
	useDialog,
	useEmbedLayout,
	useToast,
	useViewReport
} from '@cloudillo/react'

import { setupAwareness } from './awareness'
import {
	DEFAULT_COLS,
	DEFAULT_ROWS,
	FORMULA_RECALC_DEBOUNCE_MS,
	FORMULA_RECALC_MAX_DELAY_MS,
	FROZEN_PANE_APPLY_DELAY_MS
} from './constants'
import {
	buildEmbedReport,
	clampSelection,
	type EmbedTarget,
	isEmbedEditOp,
	resolveEmbedNav
} from './embed-view'
import { downloadExport } from './export.js'
import { downloadXlsxExport } from './export-xlsx.js'
import type { FreezeType } from './fortune-sheet-types'
import { freezeSheet } from './fortune-sheet-types'
import { generateSheetId } from './id-generator'
import { importXlsx } from './import-xlsx.js'
import { NamedRangesPanel, nameErrorText } from './NamedRangesPanel'
import {
	anchorFromIndices,
	createNamedRange,
	formatRangeNav,
	getNamesMap,
	type RangeAnchor,
	type ResolvedRange
} from './named-ranges'
import { deleteSheet, transformOp } from './transform-ops'
import {
	createDebouncedThrottle,
	createLocalEchoGuard,
	DEV,
	isValidSheetIdValue,
	showUserError
} from './utils'
import {
	ensureSheetDimensions,
	getOrCreateSheet,
	pruneInvalidMerges,
	readSheet,
	transformSheetToCelldata
} from './ydoc-helpers'
import { applySheetYEvent } from './yjs-events'
// Import modules
import type { SheetId } from './yjs-types'

// Read-only viewers keep copy; every other context-menu entry is inert under allowEdit=false.
// This MUST be a module constant, not inline props: FortuneSheet memoises its merged
// settings on prop *values* (`useMemo(..., _.values(props))`), so a fresh array each
// render rebuilds them, re-fires `useImperativeHandle`, and bounces our ref callback
// into an endless setState loop.
const READONLY_WORKBOOK_PROPS = {
	showToolbar: false,
	showFormulaBar: false,
	cellContextMenu: ['copy'],
	headerContextMenu: ['copy'],
	sheetTabContextMenu: []
}

// Embed mode shows the bare grid. Module constants for the same reason as above.
const EMBED_WORKBOOK_PROPS = {
	showToolbar: false,
	showFormulaBar: false,
	showSheetTabs: false,
	rowHeaderWidth: 0,
	columnHeaderHeight: 0
}
const EMBED_READONLY_WORKBOOK_PROPS = { ...READONLY_WORKBOOK_PROPS, ...EMBED_WORKBOOK_PROPS }

// A zero header size moves the grid to the origin, but Fortune still renders the header
// elements (their `size - 1.5` style goes negative and is dropped), so hide them. The
// scrollbars stay laid out: `scroll()` drives their scroll offsets. The stat bar renders
// even without sheet tabs; its 22px would come off the canvas and blank the last row.
// Fortune sets `display: block` inline on the focus box, hence `!important`.
const EMBED_CSS = `.calcillo-embed .fortune-row-header,
.calcillo-embed .fortune-col-header-wrap,
.calcillo-embed .fortune-stat-area { display: none }
.calcillo-embed .luckysheet-scrollbars { opacity: 0; pointer-events: none }
.calcillo-embed-static #luckysheet-cell-selected-boxs,
.calcillo-embed-static .luckysheet-cell-selected-focus { display: none !important }`

// FortuneSheet 1.0.4 seeds a sheet with no saved selection as `{ row: [0], column: [0] }`,
// which its name box renders as "A1:NaN". Complete the range once it has been seeded.
function fixSeededSelection(wb: WorkbookInstance | null) {
	const sel = wb?.getSelection()
	if (sel?.some((r) => r.row.length < 2 || r.column.length < 2)) {
		wb?.setSelection([{ row: [0, 0], column: [0, 0] }])
	}
}

// Snapshot all sheets in sheetOrder for FortuneSheet's `data` prop.
// `readOnly` (an embed) never writes: a sheet with missing structures renders empty.
function readSheets(yDoc: Y.Doc, readOnly: boolean): FortuneSheet[] {
	const data: FortuneSheet[] = []
	const seenIds = new Set<string>()
	// Wrap in transaction to prevent triggering ops
	yDoc.transact(() => {
		for (const sheetId of yDoc.getArray<SheetId>('sheetOrder').toArray()) {
			// Dedupe by sheet ID (safety check for development StrictMode)
			if (seenIds.has(sheetId)) {
				if (DEV) console.warn('[Load] Duplicate sheet detected:', sheetId)
				continue
			}
			seenIds.add(sheetId)
			const sheet = readOnly ? readSheet(yDoc, sheetId) : getOrCreateSheet(yDoc, sheetId)
			if (!sheet) {
				data.push({ id: sheetId, name: '', celldata: [] })
				continue
			}
			const { celldata, config } = transformSheetToCelldata(sheet)
			data.push({ id: sheetId, name: sheet.name.toString(), celldata, config })
		}
	}, 'load') // Use origin='load' to identify this as a load operation
	return data
}

export function CalcilloApp() {
	const { t } = useTranslation()
	const cloudillo = useCloudilloEditor(APP_NAME)
	const isReadOnly = cloudillo.access !== 'write'
	const meta = cloudillo.yDoc.getMap('meta')
	const embedded = getAppBus().embedded
	const [loaded, setLoaded] = React.useState(false)
	const [initialized, setInitialized] = React.useState(false)
	const [origCellData, setOrigCellData] = React.useState<FortuneSheet[] | undefined>()
	const [workbookKey, setWorkbookKey] = React.useState(0)
	const workbookRef = React.useRef<WorkbookInstance>(null)
	// Fortune hands out a new handle on every context change, so state tracks mount only
	// (storing the handle looped: effect → addPresences → new handle → effect). Read workbookRef.
	const [workbookReady, setWorkbookReady] = React.useState(false)

	// Create local echo guard to prevent feedback loops
	const localEchoGuard = React.useMemo(() => createLocalEchoGuard(), [])

	// Embed mode: the host's nav picks a range; layout carries scale and interactivity
	const layout = useEmbedLayout()
	const [embedNav, setEmbedNav] = React.useState<string | undefined>()
	React.useEffect(() => {
		if (!embedded) return
		setEmbedNav(getAppBus().getState().navState)
		return getAppBus().onViewSet(setEmbedNav)
	}, [cloudillo.synced])

	// Bumped on any document change while embedded, to re-resolve and re-measure the range
	const [docVersion, setDocVersion] = React.useState(0)
	React.useEffect(() => {
		if (!embedded || !loaded) return
		const bump = () => setDocVersion((v) => v + 1)
		const sheets = cloudillo.yDoc.getMap('sheets')
		const names = getNamesMap(cloudillo.yDoc)
		const sheetOrder = cloudillo.yDoc.getArray('sheetOrder')
		sheets.observeDeep(bump)
		names.observe(bump)
		sheetOrder.observe(bump)
		return () => {
			sheets.unobserveDeep(bump)
			names.unobserve(bump)
			sheetOrder.unobserve(bump)
		}
	}, [loaded])

	// A nav that no longer resolves keeps showing the last good range, reported missing
	const lastEmbedTarget = React.useRef<EmbedTarget | null>(null)
	const embedView = React.useMemo(() => {
		if (!embedded || !initialized) return null
		const target = resolveEmbedNav(cloudillo.yDoc, embedNav)
		if (target) lastEmbedTarget.current = target
		const shown =
			target ?? lastEmbedTarget.current ?? resolveEmbedNav(cloudillo.yDoc, undefined)
		return (
			shown && {
				range: shown.range,
				report: buildEmbedReport(t, cloudillo.yDoc, embedNav, shown, !target)
			}
		)
	}, [initialized, embedNav, docVersion, t])
	useViewReport(embedView?.report ?? null)

	const embedRange = embedView?.range
	const embedRangeRef = React.useRef(embedRange)
	embedRangeRef.current = embedRange
	const embedEditable = embedded && !!layout?.interactive && !isReadOnly
	// Debounced: a zoom change remounts the Workbook, so only once a resize drag settles
	const embedZoom = useDebouncedValue(Math.round((layout?.scale ?? 1) * 100) / 100, 200)
	const embedSheetId = embedRange?.sheetId

	// Fortune reads the active sheet (`status`) and `zoomRatio` from `data` only on mount, and
	// has no zoom API. The embed Workbook is re-keyed on both, so take a fresh snapshot too.
	const workbookData = React.useMemo(() => {
		if (!embedded || !origCellData) return origCellData
		return readSheets(cloudillo.yDoc, true).map((s) =>
			s.id === embedSheetId ? { ...s, status: 1, zoomRatio: embedZoom } : s
		)
	}, [origCellData, embedSheetId, embedZoom])
	const fortuneKey = embedded ? `${workbookKey}:${embedSheetId}:${embedZoom}` : workbookKey

	// Stable identity: FortuneSheet memoises its settings on prop values (see READONLY_WORKBOOK_PROPS).
	// afterActivateSheet fires in a setTimeout, after the library has seeded the new sheet.
	// afterSelectionChange keeps an embed's selection inside its range (no-op otherwise).
	const workbookHooks = React.useMemo(
		() => ({
			afterActivateSheet: () => fixSeededSelection(workbookRef.current),
			afterSelectionChange: (
				_sheetId: string,
				sel: { row: number[]; column: number[] } | undefined
			) => {
				const r = embedRangeRef.current
				const clamped = r && sel && clampSelection(sel, r)
				if (clamped) workbookRef.current?.setSelection([clamped])
			}
		}),
		[]
	)
	React.useEffect(() => {
		fixSeededSelection(workbookRef.current)
	}, [workbookReady, fortuneKey])

	// Embed: bring the range's top-left to the origin (Fortune lays out rows after mount)
	React.useEffect(() => {
		if (!workbookReady || !embedRange) return
		const timerId = setTimeout(() => {
			const wb = workbookRef.current
			if (!wb) return
			localEchoGuard.withGuard(() => {
				wb.calculateFormula()
				wb.scroll({
					targetRow: embedRange.top,
					targetColumn: embedRange.left
				})
			})
		}, FROZEN_PANE_APPLY_DELAY_MS)
		return () => clearTimeout(timerId)
	}, [workbookReady, fortuneKey, embedRange?.top, embedRange?.left])

	const dialog = useDialog()
	const toast = useToast()
	const copyLink = useCopyEmbedLink()
	const [showNames, setShowNames] = React.useState(false)

	// Guarded: selecting a range must never write to the doc
	function selectRange(r: ResolvedRange) {
		const wb = workbookRef.current
		if (!wb) return
		const switching = wb.getSheet()?.id !== r.sheetId
		// Fortune's setSelection mutates the range it is given, so it must not share a tick with
		// activateSheet (React re-runs the queued updater on an immer-frozen copy), and it needs
		// the new sheet's row/column layout, which Fortune computes asynchronously.
		const select = () =>
			localEchoGuard.withGuard(() => {
				const w = workbookRef.current
				w?.setSelection([{ row: [r.top, r.bottom], column: [r.left, r.right] }], {
					id: r.sheetId
				})
				w?.scroll({ targetRow: r.top, targetColumn: r.left })
			})
		if (switching) {
			localEchoGuard.withGuard(() => wb.activateSheet({ id: r.sheetId }))
			setTimeout(select, FROZEN_PANE_APPLY_DELAY_MS)
		} else select()
	}

	function getSelectionAnchor(): RangeAnchor | null {
		const wb = workbookRef.current
		const sel = wb?.getSelection()?.[0]
		const sheetId = wb?.getSheet()?.id
		if (!sel || !sheetId || sel.row.length < 2 || sel.column.length < 2) return null
		try {
			return anchorFromIndices(
				cloudillo.yDoc,
				sheetId as SheetId,
				sel.row[0],
				sel.column[0],
				sel.row[1],
				sel.column[1]
			)
		} catch {
			return null
		}
	}

	// Synchronous inside the click: the clipboard write needs the user-activation window
	function copyEmbedLink(nav: string) {
		const resId = getAppBus().resId
		if (resId) copyLink(docRef('calcillo', resId, nav))
	}

	function copySelectionLink() {
		const anchor = getSelectionAnchor()
		if (anchor) copyEmbedLink(formatRangeNav(anchor))
		else toast.error(t('Select a range first'))
	}

	async function nameSelection() {
		const anchor = getSelectionAnchor()
		if (!anchor) {
			toast.error(t('Select a range first'))
			return
		}
		const name = (await dialog.askText(t('Name selection'), t('Range name')))?.trim()
		if (!name) return
		try {
			createNamedRange(cloudillo.yDoc, name, anchor)
			setShowNames(true)
		} catch (err) {
			toast.error(nameErrorText(t, err, t('Failed to name range')))
		}
	}

	// Setup awareness on provider ready - use state instead of ref for dependency
	React.useEffect(() => {
		if (!cloudillo.provider || !workbookReady) return

		// The idTag goes on the wire as-is; two tabs of the same user share a
		// colour by design, and FortuneSheet already keys its presences by
		// awareness clientId, so they stay separate cursors.
		const cleanup = setupAwareness(
			cloudillo.provider.awareness,
			() => workbookRef.current,
			{
				idTag: cloudillo.idTag,
				displayName: cloudillo.displayName,
				// A share-link guest carries the owner's idTag; this is what keeps it
				// off the wire. Listed in the deps below, so a late sign-in re-publishes.
				authenticated: cloudillo.authenticated
			},
			cloudillo.darkMode
		)

		return cleanup
		// `darkMode` is a dep on purpose: tearing down and re-seeding is what
		// re-colours the cursors already on screen after a theme flip. `fortuneKey`
		// re-seeds a remounted Workbook (the ready flag doesn't flip across a re-key).
	}, [
		cloudillo.provider,
		workbookReady,
		fortuneKey,
		cloudillo.idTag,
		cloudillo.displayName,
		cloudillo.authenticated,
		cloudillo.darkMode
	])

	// Load initial data and setup observers
	React.useEffect(() => {
		if (!cloudillo.provider) return

		// Guards the deferred merge prune below against firing after unmount
		let cancelled = false

		const ySheets = cloudillo.yDoc.getMap('sheets')
		const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

		// Create debounced+throttled formula recalculation
		const formulaRecalc = createDebouncedThrottle(
			() => {
				workbookRef.current?.calculateFormula()
			},
			FORMULA_RECALC_DEBOUNCE_MS,
			FORMULA_RECALC_MAX_DELAY_MS
		)

		// Helper to update sheet order in FortuneSheet
		const syncSheetOrder = () => {
			const orderedSheetIds = sheetOrder.toArray()
			const orderMap: Record<string, number> = {}
			orderedSheetIds.forEach((id, index) => {
				orderMap[id] = index
			})
			if (workbookRef.current && Object.keys(orderMap).length > 0) {
				workbookRef.current.setSheetOrder(orderMap)
			}
		}

		// Observe sheet order changes (FIX: was missing!)
		const sheetOrderObserver = (evt: Y.YArrayEvent<SheetId>) => {
			if (evt.transaction.local) return
			if (evt.transaction.origin === 'load') return

			syncSheetOrder()
		}
		sheetOrder.observe(sheetOrderObserver)

		// Observe top-level sheets map changes (sheet additions/deletions)
		const sheetsObserver = (evt: Y.YMapEvent<unknown>) => {
			// Only handle remote changes (not local ones)
			if (evt.transaction.local) return

			// Skip if this is from a load transaction
			if (evt.transaction.origin === 'load') return

			// Check if any sheets were added or deleted
			for (const [sheetId, change] of evt.changes.keys.entries()) {
				switch (change.action) {
					case 'add': {
						// Add the sheet to Fortune Sheet with the correct ID
						workbookRef.current?.addSheet(sheetId)

						// Load sheet data and set the name
						const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId as SheetId)
						const sheetName = sheet.name.toString()
						if (sheetName) {
							workbookRef.current?.setSheetName(sheetName, { id: sheetId })
						}

						// Update sheet order to match CRDT sheetOrder array
						syncSheetOrder()
						break
					}
					case 'delete':
						workbookRef.current?.deleteSheet({ id: sheetId })
						break
				}
			}
		}
		ySheets.observe(sheetsObserver)

		// Observe sheet data changes (deep observer for cell/config changes)
		const sheetsDeepObserver = (evts: Y.YEvent<Y.AbstractType<unknown>>[]) => {
			const txn = evts[0]?.transaction
			if (!workbookRef.current) return

			// Skip if this is from a load transaction
			if (txn?.origin === 'load') return

			// Skip local changes
			if (txn?.local) return
			let needsRecalc = false
			const structurallyChanged = new Set<SheetId>()

			// Set flag to prevent onOp from writing back to Yjs
			localEchoGuard.withGuard(() => {
				for (const evt of evts) {
					// Skip top-level sheets map changes (handled by ySheets.observe above)
					if (!evt.path[0]) continue

					const sheetId = String(evt.path[0]) as SheetId
					// evt.path is [sheetId, ...], so path[1] is the sheet-level key
					if (
						evt.path.length === 2 &&
						(evt.path[1] === 'rowOrder' || evt.path[1] === 'colOrder')
					) {
						structurallyChanged.add(sheetId)
					}
					try {
						const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId)
						needsRecalc ||= applySheetYEvent(sheetId, sheet, workbookRef.current!, evt)
					} catch (error) {
						showUserError(`Failed to apply remote change for sheet ${sheetId}`, error)
					}
				}
			})

			if (needsRecalc) {
				formulaRecalc.trigger()
			}

			// A remote row/column deletion can strand a merge this client repaired locally
			// (each side keeps the boundary the other removed). Pruning only deletes, so it is
			// idempotent and every client converges on the same merge map. It does NOT rescue
			// the merge itself: concurrent deletions of opposite boundaries still lose it —
			// as they did before repair existed. Deferred to a microtask because Yjs forbids
			// modifying a document from inside its own event dispatch.
			//
			// Safe against pruning a merge that is merely mid-repair: onOp wraps transformOp —
			// and therefore deleteRows/deleteColumns — in a single yDoc.transact, so a peer's
			// order deletion and its merge repair always arrive as one atomic update.
			if (structurallyChanged.size > 0) {
				queueMicrotask(() => {
					if (cancelled || cloudillo.yDoc.isDestroyed) return
					cloudillo.yDoc.transact(() => {
						for (const sheetId of structurallyChanged) {
							pruneInvalidMerges(getOrCreateSheet(cloudillo.yDoc, sheetId))
						}
					}, 'prune')
				})
			}
		}
		ySheets.observeDeep(sheetsDeepObserver)

		// Wait for initialization flag from server
		const handleMetaChange = () => {
			if (meta.get('i')) {
				setLoaded(true)
			}
		}

		meta.observe(handleMetaChange)

		// Check immediately in case flag already set
		if (meta.get('i')) {
			setLoaded(true)
		}

		return () => {
			cancelled = true
			meta.unobserve(handleMetaChange)
			ySheets.unobserve(sheetsObserver)
			ySheets.unobserveDeep(sheetsDeepObserver)
			sheetOrder.unobserve(sheetOrderObserver)
			formulaRecalc.cancel()
		}
	}, [cloudillo.provider])

	// Handle import data from shell (xlsx → calcillo conversion)
	// Registered unconditionally — import data may arrive after init already ran,
	// so we clear any auto-created sheets and re-initialize the workbook.
	React.useEffect(() => {
		if (!cloudillo.synced) return

		const bus = getAppBus()
		const cleanup = bus.onImportData(async (payload) => {
			try {
				// Decode base64 to ArrayBuffer
				const binary = atob(payload.data)
				const bytes = new Uint8Array(binary.length)
				for (let i = 0; i < binary.length; i++) {
					bytes[i] = binary.charCodeAt(i)
				}

				// Clear any auto-created sheets before importing
				const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')
				const sheets = cloudillo.yDoc.getMap('sheets')
				cloudillo.yDoc.transact(() => {
					while (sheetOrder.length > 0) {
						const id = sheetOrder.get(0)
						sheetOrder.delete(0, 1)
						sheets.delete(id)
					}
				})

				await importXlsx(cloudillo.yDoc, bytes.buffer)
				bus.notifyImportComplete(true)

				// Force re-initialization of the workbook UI
				setOrigCellData(undefined)
				setInitialized(false)
				setWorkbookKey((k) => k + 1)
			} catch (err) {
				console.error('[Import] Import failed:', err)
				bus.notifyImportComplete(
					false,
					err instanceof Error ? err.message : 'Import failed'
				)
			}
		})

		return cleanup
	}, [cloudillo.synced, cloudillo.yDoc])

	// Load workbook data - MUST wait for sync to complete before checking for sheets
	// Otherwise race condition: multiple clients see empty sheets and each creates their own
	React.useEffect(() => {
		// Wait for BOTH: document is initialized AND sync has completed
		if (!loaded || !cloudillo.synced || origCellData) return

		const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

		// Use sheetOrder array for consistent ordering across clients.
		// An embed never creates the first sheet: it does not write to the document.
		if (sheetOrder.length > 0 || embedded) {
			setOrigCellData(readSheets(cloudillo.yDoc, embedded))
		} else {
			const data: FortuneSheet[] = []
			// No sheets - create first sheet - MUST be in transaction!
			cloudillo.yDoc.transact(() => {
				const sheetId = generateSheetId()
				const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId)
				ensureSheetDimensions(sheet, DEFAULT_ROWS, DEFAULT_COLS)

				// Set the sheet name
				sheet.name.insert(0, t('Sheet') + ' 1')

				// Add to sheetOrder array for consistent ordering
				sheetOrder.push([sheetId])

				data.push({
					id: sheetId,
					name: t('Sheet') + ' 1'
				})
			})
			setOrigCellData(data)
		}
		setInitialized(true)
	}, [loaded, cloudillo.synced, origCellData])

	// Calculate formulas and apply frozen panes after initialization
	// (embeds recalculate in their scroll effect and ignore frozen panes)
	React.useEffect(() => {
		if (!initialized || !workbookRef.current || embedded) return

		workbookRef.current.calculateFormula()

		// Apply frozen panes for all sheets (FortuneSheet doesn't auto-apply from config)
		// Use setTimeout to ensure Fortune Sheet has finished rendering the sheets
		const timerId = setTimeout(() => {
			if (!workbookRef.current) return

			const ySheets = cloudillo.yDoc.getMap('sheets')
			for (const sheetId of ySheets.keys()) {
				try {
					const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId as SheetId)
					if (sheet.frozen && sheet.frozen.size > 0) {
						const frozenType = sheet.frozen.get('type') as string | undefined
						if (frozenType) {
							const rowFocus = sheet.frozen.get('rowFocus') as number | undefined
							const colFocus = sheet.frozen.get('colFocus') as number | undefined

							const range = {
								row: rowFocus ?? 0,
								column: colFocus ?? 0
							}

							// Set flag to prevent onOp from writing back to Yjs
							localEchoGuard.withGuard(() => {
								freezeSheet(workbookRef.current!, frozenType as FreezeType, range, {
									id: sheetId
								})
							})
						}
					}
				} catch (error) {
					showUserError(`Failed to apply frozen panes for sheet ${sheetId}`, error)
				}
			}
		}, FROZEN_PANE_APPLY_DELAY_MS)

		return () => clearTimeout(timerId)
	}, [initialized])

	// Handle operations from FortuneSheet
	const onOp = React.useCallback(
		(ops: Op[]) => {
			// Skip operations before initialization (during load)
			if (!initialized) return

			// Skip operations triggered by applying remote changes
			// This prevents feedback loops when wb.freeze() etc. trigger onOp
			if (localEchoGuard.isGuarded()) return

			try {
				cloudillo.yDoc.transact(() => {
					const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

					for (const op of ops) {
						// Embed: zoom, scroll and selection are local; only in-range cell edits write
						if (embedded) {
							const r = embedRangeRef.current
							if (!r || !isEmbedEditOp(op, r)) continue
						}

						// Handle sheet deletion
						if (op.op === 'deleteSheet') {
							// FIX: Proper validation instead of string comparison
							if (!isValidSheetIdValue(op.id)) {
								console.error(
									'[onOp] INVALID deleteSheet - Missing/invalid sheet ID:',
									op
								)
								continue
							}
							deleteSheet(cloudillo.yDoc, op.id)
							continue
						}

						// Skip operations without a valid sheet ID
						// This happens when Fortune Sheet triggers ops in response to our remote change handling
						// (e.g., deleteSheet triggers a 'replace' op with undefined id)
						// FIX: Proper validation instead of string comparison
						if (!isValidSheetIdValue(op.id)) continue

						try {
							// For addSheet operations, also add to sheetOrder array
							if (op.op === 'addSheet') {
								const sheetId = op.id as SheetId
								// Only add if not already in order array
								if (!sheetOrder.toArray().includes(sheetId)) {
									sheetOrder.push([sheetId])
								}
							}

							const sheet = getOrCreateSheet(cloudillo.yDoc, op.id as SheetId)
							transformOp(sheet, op)
						} catch (error) {
							showUserError(`Failed to process operation: ${op.op}`, { op, error })
						}
					}
				})
			} catch (error) {
				showUserError('Failed to sync changes. Please refresh the page.', error)
			}
		},
		[initialized, localEchoGuard]
	)

	const combinedRef = React.useCallback((instance: WorkbookInstance | null) => {
		workbookRef.current = instance
		setWorkbookReady(!!instance)
	}, [])

	const canEdit = embedded ? embedEditable : !isReadOnly
	const workbookProps = embedded
		? embedEditable
			? EMBED_WORKBOOK_PROPS
			: EMBED_READONLY_WORKBOOK_PROPS
		: isReadOnly
			? READONLY_WORKBOOK_PROPS
			: {}
	const workbook = workbookData && workbookData.length > 0 && (
		<Workbook
			key={fortuneKey}
			ref={combinedRef}
			data={workbookData}
			onOp={canEdit ? onOp : undefined}
			generateSheetId={generateSheetId}
			allowEdit={canEdit}
			hooks={workbookHooks}
			{...workbookProps}
		/>
	)

	if (embedded) {
		return (
			<div
				className={`h-100 calcillo-sheet calcillo-embed${layout?.interactive ? '' : ' calcillo-embed-static'}`}
			>
				<style>{EMBED_CSS}</style>
				{workbook}
			</div>
		)
	}

	return (
		origCellData && (
			// FortuneSheet measures its own container, so the DocBar has to be a
			// SIBLING of a properly sized flex child — never an overlay on top of
			// the workbook, which would leave it measuring the wrong height.
			<div className="c-vbox h-100">
				<AppDocBar awareness={cloudillo.provider?.awareness}>
					<DocBarMenu>
						<MenuItem
							icon={<PiExportBold />}
							label={t('Export to JSON')}
							onClick={() => downloadExport(cloudillo.yDoc)}
						/>
						<MenuItem
							icon={<PiExportBold />}
							label={t('Export to XLSX')}
							onClick={() => downloadXlsxExport(cloudillo.yDoc)}
						/>
						<MenuDivider />
						{!isReadOnly && (
							<MenuItem
								icon={<IcName />}
								label={t('Name selection…')}
								onClick={nameSelection}
							/>
						)}
						<MenuItem
							icon={<IcLink />}
							label={t('Copy embed link to selection')}
							onClick={copySelectionLink}
						/>
						<MenuItem
							icon={<IcNames />}
							label={t('Named ranges')}
							checked={showNames}
							onClick={() => setShowNames((v) => !v)}
						/>
						<MenuDivider />
						<MenuHeader>v{__APP_VERSION__}</MenuHeader>
					</DocBarMenu>
				</AppDocBar>
				<div className="c-hbox flex-fill" style={{ minHeight: 0 }}>
					<div className="flex-fill calcillo-sheet" style={{ minWidth: 0 }}>
						{workbook}
					</div>
					{showNames && (
						<NamedRangesPanel
							yDoc={cloudillo.yDoc}
							readOnly={isReadOnly}
							getSelectionAnchor={getSelectionAnchor}
							onSelect={selectRange}
							onCopyLink={copyEmbedLink}
							onClose={() => setShowNames(false)}
						/>
					)}
				</div>
				<DialogContainer />
				<Toasts />
			</div>
		)
	)
}

// vim: ts=4
