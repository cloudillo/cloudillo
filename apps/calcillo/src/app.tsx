// This file is part of the Cloudillo Platform.
// Copyright (C) 2024	Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.	See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.	If not, see <https://www.gnu.org/licenses/>.

const APP_NAME = 'Calcillo'

declare const __APP_VERSION__: string

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet as FortuneSheet, SheetConfig, Op } from '@fortune-sheet/core'
import { Workbook, WorkbookInstance } from '@fortune-sheet/react'
import * as Y from 'yjs'
import { PiDotsThreeVerticalBold, PiExportBold } from 'react-icons/pi'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@fortune-sheet/react/dist/index.css'
import './style.css'

import { useCloudilloEditor } from '@cloudillo/react'
import { downloadExport } from './export.js'

// Import modules
import type { SheetId } from './yjs-types'
import { toSheetId, isValidSheetId } from './yjs-types'
import { generateSheetId } from './id-generator'
import { getOrCreateSheet, ensureSheetDimensions, transformSheetToCelldata } from './ydoc-helpers'
import { transformOp, deleteSheet } from './transform-ops'
import { applySheetYEvent } from './yjs-events'
import { setupAwareness } from './awareness'
import { debug } from './debug'
import {
	DEFAULT_ROWS,
	DEFAULT_COLS,
	FORMULA_RECALC_DEBOUNCE_MS,
	FORMULA_RECALC_MAX_DELAY_MS,
	FROZEN_PANE_APPLY_DELAY_MS
} from './constants'
import {
	createLocalEchoGuard,
	isValidSheetIdValue,
	createDebouncedThrottle,
	showUserError
} from './utils'

export function CalcilloApp() {
	const { t } = useTranslation()
	const cloudillo = useCloudilloEditor(APP_NAME)
	const isReadOnly = cloudillo.access === 'read'
	const meta = cloudillo.yDoc.getMap('meta')
	const [loaded, setLoaded] = React.useState(false)
	const [initialized, setInitialized] = React.useState(false)
	const [origCellData, setOrigCellData] = React.useState<FortuneSheet[] | undefined>()
	const workbookRef = React.useRef<WorkbookInstance>(null)
	// Track workbook instance via state so effect can react to it
	const [workbookInstance, setWorkbookInstance] = React.useState<WorkbookInstance | null>(null)

	// Toolbar menu state
	const [menuOpen, setMenuOpen] = React.useState(false)
	const menuRef = React.useRef<HTMLDivElement>(null)
	const [menuAnchorRect, setMenuAnchorRect] = React.useState<DOMRect | null>(null)

	// Close menu on click outside
	React.useEffect(() => {
		if (!menuOpen) return
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener('pointerdown', handleClickOutside)
		return () => document.removeEventListener('pointerdown', handleClickOutside)
	}, [menuOpen])

	// Create local echo guard to prevent feedback loops
	const localEchoGuard = React.useMemo(() => createLocalEchoGuard(), [])

	// Setup awareness on provider ready - use state instead of ref for dependency
	// Generate unique client ID for awareness (Yjs clientID + random suffix for same-user distinction)
	const awarenessClientId = React.useMemo(
		() => `${cloudillo.yDoc.clientID}-${Math.random().toString(36).slice(2, 8)}`,
		[cloudillo.yDoc.clientID]
	)

	React.useEffect(() => {
		if (!cloudillo.provider || !workbookInstance) return

		const cleanup = setupAwareness(
			cloudillo.provider.awareness,
			workbookInstance,
			// Use unique client ID for awareness to distinguish same-user clients
			`${cloudillo.idTag ?? 'anonymous'} (${awarenessClientId.slice(-4)})`,
			cloudillo.displayName
		)

		return cleanup
	}, [
		cloudillo.provider,
		workbookInstance,
		awarenessClientId,
		cloudillo.idTag,
		cloudillo.displayName
	])

	// Load initial data and setup observers
	React.useEffect(() => {
		if (!cloudillo.provider) return

		debug.log('[EFFECT] Provider ready, Y.Doc client ID:', cloudillo.yDoc.clientID)

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

			debug.log('[sheetOrder.observe] Sheet order changed')
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
						debug.log('[sheets.observe] Sheet added:', sheetId)
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
						debug.log('[sheets.observe] Sheet deleted:', sheetId)
						workbookRef.current?.deleteSheet({ id: sheetId })
						break
				}
			}
		}
		ySheets.observe(sheetsObserver)

		// Observe sheet data changes (deep observer for cell/config changes)
		const sheetsDeepObserver = (evts: Y.YEvent<any>[]) => {
			const txn = evts[0]?.transaction
			if (!workbookRef.current) return

			// Skip if this is from a load transaction
			if (txn?.origin === 'load') return

			// Skip local changes
			if (txn?.local) return
			let needsRecalc = false

			// Set flag to prevent onOp from writing back to Yjs
			localEchoGuard.withGuard(() => {
				for (const evt of evts) {
					// Skip top-level sheets map changes (handled by ySheets.observe above)
					if (!evt.path[0]) {
						debug.log(
							'[observeDeep] Skipping top-level change (handled by sheets.observe)'
						)
						continue
					}

					const sheetId = String(evt.path[0]) as SheetId
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
			meta.unobserve(handleMetaChange)
			ySheets.unobserve(sheetsObserver)
			ySheets.unobserveDeep(sheetsDeepObserver)
			sheetOrder.unobserve(sheetOrderObserver)
			formulaRecalc.cancel()
		}
	}, [cloudillo.provider])

	// Load workbook data - MUST wait for sync to complete before checking for sheets
	// Otherwise race condition: multiple clients see empty sheets and each creates their own
	React.useEffect(() => {
		// Wait for BOTH: document is initialized AND sync has completed
		if (!loaded || !cloudillo.synced || origCellData) return

		const data: FortuneSheet[] = []
		const ySheets = cloudillo.yDoc.getMap('sheets')
		const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

		// Use sheetOrder array for consistent ordering across clients
		const existingSheetIds = sheetOrder.toArray()

		if (existingSheetIds.length > 0) {
			// Load existing sheets - wrap in transaction to prevent triggering ops
			cloudillo.yDoc.transact(() => {
				for (const sheetId of existingSheetIds) {
					const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId)
					const { celldata, config } = transformSheetToCelldata(sheet)

					data.push({
						id: sheetId,
						name: sheet.name.toString(),
						celldata,
						config
					})
				}
			}, 'load') // Use origin='load' to identify this as a load operation
		} else {
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
		}

		// Dedupe by sheet ID (safety check for development StrictMode)
		const seenIds = new Set<string>()
		const dedupedData = data.filter((sheet) => {
			if (!sheet.id) return false
			if (seenIds.has(sheet.id)) {
				debug.warn('[Load] Duplicate sheet detected:', sheet.id)
				return false
			}
			seenIds.add(sheet.id)
			return true
		})

		setOrigCellData(dedupedData)
		setInitialized(true)
	}, [loaded, cloudillo.synced, origCellData])

	// Calculate formulas and apply frozen panes after initialization
	React.useEffect(() => {
		if (!initialized || !workbookRef.current) return

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

							debug.log('[Init] Applying frozen panes:', {
								sheetId,
								type: frozenType,
								range
							})
							// Set flag to prevent onOp from writing back to Yjs
							localEchoGuard.withGuard(() => {
								workbookRef.current!.freeze(frozenType as any, range, {
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
			if (!initialized) {
				debug.log('[onOp] Skipping operations during initialization')
				return
			}

			// Skip operations triggered by applying remote changes
			// This prevents feedback loops when wb.freeze() etc. trigger onOp
			if (localEchoGuard.isGuarded()) {
				debug.log('[onOp] Skipping operations triggered by remote change application')
				return
			}

			debug.log(
				'[onOp] Received operations:',
				ops.map((op) => ({
					op: op.op,
					id: op.id,
					path: op.path,
					value: op.value
				}))
			)

			try {
				cloudillo.yDoc.transact(() => {
					const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

					for (const op of ops) {
						// Handle sheet deletion
						if (op.op === 'deleteSheet') {
							// FIX: Proper validation instead of string comparison
							if (!isValidSheetIdValue(op.id)) {
								debug.error(
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
						if (!isValidSheetIdValue(op.id)) {
							debug.log(
								'[onOp] Skipping operation without valid sheet ID (likely from UI update):',
								op.op,
								op.path
							)
							continue
						}

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

	// Wrap generateSheetId to log when it's called
	const wrappedGenerateSheetId = React.useCallback(() => {
		const id = generateSheetId()
		debug.log('[generateSheetId] Generated new sheet ID:', id)
		return id
	}, [])

	// Combined ref that updates both the ref and state
	const combinedRef = React.useCallback(
		(instance: WorkbookInstance | null) => {
			workbookRef.current = instance
			setWorkbookInstance(instance)
		},
		[setWorkbookInstance]
	)

	// Memoize to avoid infinite re-renders (FortuneSheet uses this in a useEffect dep)
	const customToolbarItems = React.useMemo(
		() => [
			{
				key: 'menu',
				tooltip: 'Menu',
				icon: <PiDotsThreeVerticalBold />,
				onClick: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
					setMenuAnchorRect(e.currentTarget.getBoundingClientRect())
					setMenuOpen((v) => !v)
				}
			}
		],
		[]
	)

	return (
		origCellData && (
			<>
				<Workbook
					ref={combinedRef}
					data={origCellData}
					onOp={isReadOnly ? undefined : onOp}
					generateSheetId={wrappedGenerateSheetId}
					allowEdit={!isReadOnly}
					customToolbarItems={customToolbarItems}
				/>
				{menuOpen && menuAnchorRect && (
					<div
						ref={menuRef}
						className="c-menu"
						style={{
							position: 'fixed',
							top: menuAnchorRect.bottom,
							left: menuAnchorRect.left,
							zIndex: 1000
						}}
					>
						<div
							className="c-menu-item"
							onClick={() => {
								downloadExport(cloudillo.yDoc)
								setMenuOpen(false)
							}}
						>
							<span className="c-menu-item-icon">
								<PiExportBold />
							</span>
							<span className="c-menu-item-label">{t('Export to JSON')}</span>
						</div>
						<div className="c-menu-divider" />
						<div
							className="c-menu-item"
							style={{ opacity: 0.5, pointerEvents: 'none' }}
						>
							<span className="c-menu-item-label">v{__APP_VERSION__}</span>
						</div>
					</div>
				)}
			</>
		)
	)
}

// vim: ts=4
