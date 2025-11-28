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

const APP_NAME = 'Sheello'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet as FortuneSheet, SheetConfig, Op } from '@fortune-sheet/core'
import { Workbook, WorkbookInstance } from '@fortune-sheet/react'
import * as Y from 'yjs'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@fortune-sheet/react/dist/index.css'
import './style.css'

import { useCloudilloEditor } from '@cloudillo/react'

// Import new helper modules
import type { SheetId } from './yjs-types'
import { toSheetId } from './yjs-types'
import { generateSheetId } from './id-generator'
import {
	getOrCreateSheet,
	ensureSheetDimensions,
	transformSheetToCelldata
} from './ydoc-helpers'
import { transformOp, deleteSheet } from './transform-ops'
import { applySheetYEvent } from './yjs-events'
import { setupAwareness } from './awareness'

export function SheelloApp() {
	const { t } = useTranslation()
	const cloudillo = useCloudilloEditor(APP_NAME)
	const meta = cloudillo.yDoc.getMap('meta')
	const [loaded, setLoaded] = React.useState(false)
	const [initialized, setInitialized] = React.useState(false)
	const [origCellData, setOrigCellData] = React.useState<FortuneSheet[] | undefined>()
	const workbookRef = React.useRef<WorkbookInstance>(null)
	const applyingRemoteRef = React.useRef(false)  // Flag to prevent feedback loops

	// Setup awareness on provider ready
	React.useEffect(() => {
		if (!cloudillo.provider || !workbookRef.current) return

		const cleanup = setupAwareness(
			cloudillo.provider.awareness,
			workbookRef.current,
			cloudillo.idTag ?? 'anonymous'
		)

		return cleanup
	}, [cloudillo.provider, workbookRef.current])

	// Load initial data
	React.useEffect(() => {
		if (!cloudillo.provider) return

		console.log('[EFFECT] Provider ready, Y.Doc client ID:', cloudillo.yDoc.clientID)
		console.log('[EFFECT] Provider URL:', cloudillo.provider.url)
		console.log('[EFFECT] Provider connected:', cloudillo.provider.wsconnected)

		const ySheets = cloudillo.yDoc.getMap('sheets')
		const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

		// ========== LOG RAW WEBSOCKET UPDATES ==========
		let updateCount = 0
		const handleUpdate = (update: Uint8Array, origin: unknown) => {
			updateCount++
			console.log(`\n[RAW UPDATE #${updateCount}]`)
			console.log(`  Size: ${update.length} bytes`)
			console.log(`  Origin: ${origin}`)
			console.log(`  First 20 bytes:`, Array.from(update.slice(0, 20)))

			// Try to decode the update to see what's in it
			try {
				// Apply update to a temporary doc to inspect structure
				const tempDoc = new Y.Doc()
				Y.applyUpdate(tempDoc, update)

				const tempMeta = tempDoc.getMap('meta')
				const tempSheets = tempDoc.getMap('sheets')

				console.log(`  [DECODED] Meta keys in update:`, Array.from(tempMeta.keys()))
				console.log(`  [DECODED] Meta values:`, Object.fromEntries(tempMeta.entries()))
				console.log(`  [DECODED] Sheets keys in update:`, Array.from(tempSheets.keys()))
				console.log(`  [DECODED] Sheets size in update:`, tempSheets.size)
			} catch (err) {
				console.error(`  [DECODE ERROR]:`, err)
			}

			// Log current Y.Doc state after update
			console.log(`  After update - Meta size: ${meta.size}`)
			console.log(`  After update - Meta keys:`, Array.from(meta.keys()))
			console.log(`  After update - Sheets size: ${ySheets.size}`)
			console.log(`  After update - Sheets keys:`, Array.from(ySheets.keys()))
		}
		cloudillo.yDoc.on('update', handleUpdate)
		// ========== END RAW LOGGING ==========

		// ========== DEBUG LOGGING FOR ALL UPDATES ==========
		const logUpdate = (label: string, evt: Y.YEvent<Y.AbstractType<any>>) => {
			console.log(`\n[UPDATE] ${label}:`)

			// Log event type
			console.log(`  Event type: ${evt.constructor.name}`)

			// Log raw target info
			console.log(`  Target type: ${evt.target?.constructor?.name}`)
			if (evt.target instanceof Y.Map) {
				console.log(`  Target size: ${evt.target.size}`)
			}

			// Log ALL keys in target (not just changed)
			if (evt.target instanceof Y.Map) {
				const allKeys = Array.from(evt.target.keys())
				console.log(`  ALL keys in target:`, allKeys)
			}

			// Log what changed
			if (evt.changes?.keys) {
				const keys = evt.changes.keys
				console.log(`  Changes (size=${keys.size}):`)
				if (keys.size === 0) {
					console.warn(`  ⚠️  EMPTY CHANGES - no keys modified but event fired!`)
				}
				keys.forEach((change: { action: 'add' | 'update' | 'delete'; oldValue: unknown }, key: string) => {
					if (change.action === 'add') {
						const value = evt.target instanceof Y.Map ? evt.target.get(key) : undefined
						console.log(`    ✓ ADD "${key}":`, JSON.stringify(value, null, 2))
					} else if (change.action === 'update') {
						const value = evt.target instanceof Y.Map ? evt.target.get(key) : undefined
						console.log(`    ↻ UPDATE "${key}":`, JSON.stringify(value, null, 2))
					} else if (change.action === 'delete') {
						console.log(`    ✗ DELETE "${key}"`)
					}
				})
			} else {
				console.warn(`  ⚠️  NO evt.changes.keys!`)
			}

			// Log path for deep events
			if (evt.path && evt.path.length > 0) {
				console.log(`  Path: ${evt.path.join(' → ')}`)
			}

			// For array changes
			if (evt.changes?.delta) {
				console.log(`  Delta changes:`)
				evt.changes.delta.forEach((d: { insert?: unknown[] | string; delete?: number; retain?: number }, i: number) => {
					if (d.insert) console.log(`    INSERT[${i}]:`, d.insert)
					if (d.delete) console.log(`    DELETE[${i}]:`, d.delete, 'items')
					if (d.retain) console.log(`    RETAIN[${i}]:`, d.retain, 'items')
				})
			}
		}

		// Observe meta map
		meta.observe(evt => logUpdate('META', evt))

		// Observe sheets map (top level only)
		ySheets.observe(evt => logUpdate('SHEETS', evt))

		// Log current state
		console.log('\n[CURRENT STATE]')
		console.log('Meta:', Object.fromEntries(meta.entries()))
		console.log('Sheets keys:', Array.from(ySheets.keys()))
		// ========== END DEBUG LOGGING ==========

		// Observe top-level sheets map changes (sheet additions/deletions)
		// When sheets are added or removed, we need to handle them individually
		ySheets.observe(evt => {
			// Only handle remote changes (not local ones)
			if (evt.transaction.local) return

			// Skip if this is from a load transaction
			if (evt.transaction.origin === 'load') return

			// Check if any sheets were added or deleted
			for (const [sheetId, change] of evt.changes.keys.entries()) {
				switch (change.action) {
					case 'add': {
						console.log('[sheets.observe] Sheet added:', sheetId, evt)
						// Add the sheet to Fortune Sheet with the correct ID
						workbookRef.current?.addSheet(sheetId)

						// Load sheet data and set the name
						const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId as SheetId)
						const sheetName = sheet.name.toString()
						if (sheetName) {
							workbookRef.current?.setSheetName(sheetName, { id: sheetId })
						}

						// Update sheet order to match CRDT sheetOrder array
						const orderedSheetIds = sheetOrder.toArray()
						const orderMap: Record<string, number> = {}
						orderedSheetIds.forEach((id, index) => {
							orderMap[id] = index
						})
						workbookRef.current?.setSheetOrder(orderMap)
						break
					}
					case 'delete':
						console.log('[sheets.observe] Sheet deleted:', sheetId)
						workbookRef.current?.deleteSheet({ id: sheetId })
						break
				}
			}
		})

		// Observe sheet data changes
		// Note: We don't wrap in transaction here because observeDeep is already
		// called within the transaction that triggered these events
		// However, we batch formula recalculation to avoid multiple recalcs
		let recalcTimeoutId: number | null = null
		ySheets.observeDeep(evts => {
			if (!workbookRef.current) return
			let needsRecalc = false

			// Set flag to prevent onOp from writing back to Yjs
			// when we apply remote changes to FortuneSheet
			applyingRemoteRef.current = true
			try {
				for (const evt of evts) {
					// Skip top-level sheets map changes (handled by ySheets.observe above)
					if (!evt.path[0]) {
						console.log('[observeDeep] Skipping top-level change (handled by sheets.observe)')
						continue
					}

					const sheetId = String(evt.path[0]) as SheetId
					const sheet = getOrCreateSheet(cloudillo.yDoc, sheetId)
					needsRecalc ||= applySheetYEvent(sheetId, sheet, workbookRef.current, evt)
				}
			} finally {
				applyingRemoteRef.current = false
			}

			if (needsRecalc) {
				// Debounce formula recalculation to avoid excessive recalcs
				// during rapid remote updates
				if (recalcTimeoutId !== null) {
					clearTimeout(recalcTimeoutId)
				}
				recalcTimeoutId = window.setTimeout(() => {
					workbookRef.current?.calculateFormula()
					recalcTimeoutId = null
				}, 100)
			}
		})

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
		}
	}, [cloudillo.provider])

	// Load workbook data
	React.useEffect(() => {
		if (!loaded || origCellData) return

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
				ensureSheetDimensions(sheet, 100, 26)

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
		const dedupedData = data.filter(sheet => {
			if (!sheet.id) return false
			if (seenIds.has(sheet.id)) {
				console.warn('[Load] Duplicate sheet detected:', sheet.id)
				return false
			}
			seenIds.add(sheet.id)
			return true
		})

		setOrigCellData(dedupedData)
		setInitialized(true)
	}, [loaded, origCellData])

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

						console.log('[Init] Applying frozen panes:', { sheetId, type: frozenType, range })
						// Set flag to prevent onOp from writing back to Yjs
						applyingRemoteRef.current = true
						try {
							workbookRef.current.freeze(frozenType as any, range, { id: sheetId })
						} finally {
							applyingRemoteRef.current = false
						}
					}
				}
			}
		}, 100) // Small delay to let Fortune Sheet finish rendering

		return () => clearTimeout(timerId)
	}, [initialized])

	// Handle operations from FortuneSheet
	const onOp = React.useCallback((ops: Op[]) => {
		// Skip operations before initialization (during load)
		if (!initialized) {
			console.log('[onOp] Skipping operations during initialization')
			return
		}

		// Skip operations triggered by applying remote changes
		// This prevents feedback loops when wb.freeze() etc. trigger onOp
		if (applyingRemoteRef.current) {
			console.log('[onOp] Skipping operations triggered by remote change application')
			return
		}

		console.log('[onOp] Received operations:', ops.map(op => ({
			op: op.op,
			id: op.id,
			path: op.path,
			value: op.value
		})))

		cloudillo.yDoc.transact(() => {
			const sheetOrder = cloudillo.yDoc.getArray<SheetId>('sheetOrder')

			for (const op of ops) {
				// Handle sheet deletion
				if (op.op === 'deleteSheet') {
					if (!op.id || op.id === 'undefined') {
						console.error('[onOp] ❌ INVALID deleteSheet - Missing sheet ID:', op)
						continue
					}
					deleteSheet(cloudillo.yDoc, op.id)
					continue
				}

				// Skip operations without a valid sheet ID
				// This happens when Fortune Sheet triggers ops in response to our remote change handling
				// (e.g., deleteSheet triggers a 'replace' op with undefined id)
				if (!op.id || op.id === 'undefined') {
					console.log('[onOp] Skipping operation without valid sheet ID (likely from UI update):', op.op, op.path)
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
					console.error('[onOp] Failed to process operation:', op, error)
				}
			}
		})
	}, [initialized])

	// Wrap generateSheetId to log when it's called and ensure it returns a valid ID
	const wrappedGenerateSheetId = React.useCallback(() => {
		const id = generateSheetId()
		console.log('[generateSheetId] Generated new sheet ID:', id)
		return id
	}, [])

	return origCellData && (
		<Workbook
			ref={workbookRef}
			data={origCellData}
			onOp={onOp}
			generateSheetId={wrappedGenerateSheetId}
		/>
	)
}

// vim: ts=4
