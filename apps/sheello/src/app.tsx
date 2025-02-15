// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

const APP_NAME = 'Sheello'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet as FortuneSheet, SheetConfig as FortuneSheetConfig, Cell, CellWithRowAndCol, Op, addSheet } from '@fortune-sheet/core'
import { Workbook, WorkbookInstance } from '@fortune-sheet/react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@fortune-sheet/react/dist/index.css'
import './style.css'

import * as T from '@symbion/runtype'

import { str2color } from '@cloudillo/base'
import { useCloudilloEditor, mergeClasses } from '@cloudillo/react'

import {
} from 'react-icons/lu'

type YCell = Cell
type YRow = Y.Array<YCell | false>
type YSheetRows = Y.Array<YRow | false>
type YWorkbook = Y.Map<YSheetRows>

interface SheetConfig {
	id: string
	name: string
	config?: FortuneSheetConfig
}
type YWorkbookConfig = Y.Map<SheetConfig>

/*
interface SheetConfig {
	id: string
	name: string
	config: unknown
}

interface WorkbookConfig {
	children: SheetConfig
}

type YWorkbookConfig = Y.XmlElement
*/

let nextIdHack: string | undefined
function generateId() {
	if (nextIdHack) return nextIdHack

	const randomValues = new Uint8Array(9)
	crypto.getRandomValues(randomValues)

	const id = btoa(String.fromCharCode(...randomValues))
	console.log('generateId', id)
	return id
}

function compareCell(a: Cell, b: Cell) {
	return (a.f || b.f ? a.f == b.f : a.v == b.v)
		&& a.ct?.fa == b.ct?.fa // Cell format definition
		&& a.ct?.t == b.ct?.t	// Cell format type
		&& a.bg == b.bg // bg color
		&& a.fc == b.fc // font color
		&& a.ff == b.ff // font family
		&& a.fs == b.fs // font size
		&& a.cl == b.cl // cancelline
		&& a.bl == b.bl // vold
		&& a.it == b.it // italic
		&& a.un == b.un // underline
		&& a.vt == b.vt // vertical alignment
		&& a.ht == b.ht // horizontal alignment
		&& a.mc == b.mc // merge cell
		&& a.tb == b.tb // text wrap
		&& a.tr == b.tr // text rotation
}

function transformOp(workbookConfig: YWorkbookConfig, rows: YSheetRows, op: Op) {
	console.log('[OP] OP:', op.op, op.id, op.path.join('.'), op.value)
	console.trace('[OP] OP:', op.op, op.id, op.path.join('.'), op.value)
	if (op.path[0] == 'data') {
		switch (op.op) {
			case 'replace':
				if (op.path.length == 2) break
			case 'add':
			case 'remove':
				switch (op.path[0]) {
					case 'data': {
						let row = rows.get(+op.path[1])
						if (!row) {
							row = new Y.Array<YCell | false>()
							if (rows.length < +op.path[1]) {
								const arr = (new Array(+op.path[1] - rows.length)).fill(false)
								console.log('[OP:Y] Push empty rows', arr.length)
								rows.push(arr)
							}
							console.log('[OP:Y] Insert row', +op.path[1])
							rows.insert(+op.path[1], [row])
						}
						let cell = row.get(+op.path[2])

						if (cell) {
							const newCell = op.op == 'remove' ? false
								: op.path.length == 3 ? (op.value == null ? false : { ...op.value, m: undefined })
								: { ...cell, ...{ [op.path[3]]: op.value, m: undefined }}
							console.log('[OP] change?', op.path, cell, newCell, !compareCell(newCell, cell))
							if (!compareCell(newCell, cell)) {
								console.log('[OP:Y] Replace cell', +op.path[1], +op.path[2], newCell)
								row.delete(+op.path[2])
								row.insert(+op.path[2], [newCell])
							}
						} else if (op.op != 'remove') {
							if (row.length < +op.path[2]) {
								const arr = (new Array(+op.path[2] - row.length)).fill(false)
								console.log('[OP:Y] Push empty cells', +op.path[1], arr.length)
								row.push(arr)
							}
							console.log('[OP:Y] Insert cell', +op.path[1], +op.path[2], op.value)
							row.insert(+op.path[2], [op.value])
						}
					}
				}
				break
			case 'insertRowCol':
				if (op.value.type == 'row') {
					const arr = new Array(op.value.count).fill(false)
					console.log('[OP] insert rows', op, arr)
					rows.insert(op.value.index, arr)
				} else if (op.value.type == 'column') {
					const arr = new Array(op.value.count).fill(false)
					console.log('[OP] insert cols', op, arr)
					let r = 0
					for (const row of rows) {
						if (row && row.length > op.value.index) {
							console.log('[OP] extend row', r)
							row.insert(op.value.index, arr)
						}
						r++
					}
				}
				break
			case 'deleteRowCol':
				if (op.value.type == 'row') {
					console.log('[OP] delete rows', op)
					rows.delete(op.value.start, Math.min(op.value.end - op.value.start + 1, rows.length - op.value.start))
				} else if (op.value.type == 'column') {
					console.log('[OP] delete cols', op)
					let r = 0
					for (const row of rows) {
						console.log('[OP] check row', r, row, op.value.start)
						if (row && row.length > op.value.start) {
							console.log('[OP] delete cells in row', r)
							row.delete(op.value.start, Math.min(op.value.end - op.value.start + 1, row.length - op.value.start))
						}
						r++
					}
				}
				break
		}
	} else if (op.path[0] == 'name') {
		switch (op.op) {
			case 'add':
			case 'replace':
				if (!op.id) return
				const sheet = workbookConfig.get(op.id)
				if (!sheet) return

				workbookConfig.set(op.id, { ...sheet, name: op.value })
				console.log('workbookConfig', workbookConfig.toJSON())
		}
	} else if (op.path[0] == 'config') {
		console.log('[OP] config', op.op)
		if (op.path.length == 1) switch (op.op) {
			case 'add':
			case 'replace':
				console.log('[OP] id', op.id)
				if (!op.id) return
				const sheet = workbookConfig.get(op.id)
				console.log('[OP] sheet', sheet)
				if (!sheet) return

				workbookConfig.set(op.id, { ...sheet, config: op.value })
				console.log('workbookConfig', workbookConfig.toJSON())
		} else if (op.path.length == 3) switch (op.op) {
			case 'add':
			case 'replace':
				if (!op.id) return
				switch (op.path[1]) {
					case 'columnlen':
						const sheetConfig = workbookConfig.get(op.id)
						if (!sheetConfig || sheetConfig?.config?.columnlen?.[op.path[2]] == op.value) return
						workbookConfig.set(op.id, { ...sheetConfig, config: { ...sheetConfig?.config, columnlen: { ...sheetConfig?.config?.columnlen, [op.path[2]]: op.value } } })
						break
				}
				console.log('[OP] id', op.id)
				if (!op.id) return
				const sheet = workbookConfig.get(op.id)
				console.log('[OP] sheet', sheet)
				if (!sheet) return
		}
	} else if (!op.path.length) {
		switch (op.op) {
			case 'addSheet':
				/*
				const sheet = new Y.XmlElement()
				sheet.setAttribute('id', op.value.id)
				sheet.setAttribute('name', op.value.name)
				workbookConfig.insert(0, [sheet])
				*/
				workbookConfig.set(op.value.id, { id: op.value.id, name: op.value.name })
				console.log('workbookConfig', workbookConfig.toJSON())
				break
		}
	}
}

function applyConfigYEvent(workbookConfig: YWorkbookConfig, wb: WorkbookInstance, evt: Y.YEvent<Y.AbstractType<unknown>>): boolean {
	if (evt.transaction.local) return false

	const delta = evt.delta
	const changes = evt.changes
	let recalc = false
	console.log('[Y] config event', evt.path, evt.transaction.local ? 'local' : 'remote', changes)

	if (!evt.path.length) {
		for (const key of changes.keys.keys()) {
			const sheetConfig = workbookConfig.get(key)
			console.log('[Y] config change', key, sheetConfig?.config)
			console.log('[Y]     sheet data', wb.getAllSheets(), wb.getAllSheets().find(s => s.id == key))

			if (!wb.getAllSheets().find(s => s.id == key)) {
				console.log('[Y] addSheet', key)
				nextIdHack = key
				wb.addSheet()
				//wb.addSheet({ id: key })
			}
			console.log('[Y]     sheet data', wb.getAllSheets())

			try {

			// Sheet name
			console.log('[Y]     name', sheetConfig?.name, changes.keys.get(key)?.oldValue?.name)
			if (sheetConfig?.name && sheetConfig?.name !== changes.keys.get(key)?.oldValue?.name) {
				console.log('[Y] setSheetName', sheetConfig.name)
				wb.setSheetName(sheetConfig.name, { id: key })
			}
			// Column widths
			//for (const col of sheetConfig?.config?.columnlen || []) {
			for(const col in sheetConfig?.config?.columnlen || []) {
				const width = sheetConfig?.config?.columnlen?.[col]
				console.log('[Y]     column', col, width, wb.getColumnWidth([+col]))
				if (width !== undefined && width != changes.keys.get(key)?.oldValue?.columnlen?.[col]) {
					console.log('[Y] setColumnWidth', col, width)
					wb.setColumnWidth({ [+col]: width }, { id: key })
				}
			}

			} catch (err) {
				console.log('ERROR', err)
			}

			//recalc = true
		}
	}

	return recalc
}

function applyYEvent(rows: YSheetRows, wb: WorkbookInstance, evt: Y.YArrayEvent<Y.Array<Cell | undefined> | undefined>): boolean {
	if (evt.transaction.local) return false

	const sheetId = '' + evt.path[0]
	const path = evt.path.slice(1)
	const delta = evt.delta
	let recalc = false
	console.log('[Y] event', sheetId, path, evt.transaction.local ? 'local' : 'remote', JSON.stringify(delta, null, 4))
	if (path.length == 0) {
		// Row
		let row = 0
		while (delta.length) {
			const d = delta[0]
			if (d.retain) {
				row += d.retain
			} else if (d.insert) {
				const insRows = !d.insert ? [] : Array.isArray(d.insert) ? d.insert : [d.insert]
				for (const rowYArray of insRows) {
					const ins = rowYArray instanceof Y.Array ? rowYArray.toJSON() : []
					console.log('[Y] delta', row, ins)
					for (let i = 0; i < ins.length; i++) {
						const cellValue = ins[i].f || ins[i].v
						const cellValueOpts = { id: sheetId, type: ins[i].f ? 'f' as const : 'v' as const }
						console.log('[Y] setCellValue', row, i, cellValue, cellValueOpts)
						wb.setCellValue(row, i, cellValue, cellValueOpts)
						recalc = true
						for (const prop in ins[i]) {
							console.log('[Y] prop', row, i, prop)
							if (!['v', 'f', 'm'].includes(prop)) {
								wb.setCellFormat(row, i, prop as keyof Cell, ins[i][prop], { id: sheetId })
							}
						}
					}
					row++
				}
			} else if (d.delete) {
				console.log('[Y] delete row', row, row + d.delete - 1)
				wb.deleteRowOrColumn('row', row, row + d.delete - 1, { id: sheetId })
				recalc = true
			}
			delta.shift()
		}
	} else if (path.length == 1) {
		// Cell
		const row = +path[0]
		let pos = 0
		while (delta.length) {
			const d = delta[0]
			if (d.retain) {
				pos += d.retain
			//} else if (delta.length >= 2 && d.insert && delta[1].delete) {
			} else if (d.insert) {
				const ins = !d.insert ? [] : Array.isArray(d.insert) ? d.insert : [d.insert]
				//const del = delta[1].delete ?? 0
				//console.log('delta', ins)
				for (let i = 0; i < ins.length; i++) {
					const cellValue = ins[i].f || ins[i].v
					const cellValueOpts = { id: sheetId, type: ins[i].f ? 'f' as const : 'v' as const }
					console.log('[Y] setCellValue', row, pos + i, cellValue, cellValueOpts)
					wb.setCellValue(row, pos + i, cellValue, cellValueOpts)
					recalc = true
					for (const prop in ins[i]) {
						console.log('[Y] prop', row, pos + i, prop, ins[i][prop])
						if (!['v', 'f', 'm'].includes(prop)) wb.setCellFormat(row, pos + i, prop as keyof Cell, ins[i][prop], { id: sheetId })
					}
				}
				//delta.shift()
			} else {
				console.log('[Y] FIXME: SKIPPED DELTA!!!!!!!!!!!!!', d)
			}
			delta.shift()
		}
	}
	return recalc
}

function transformCellData(rows: ((Cell | undefined)[] | undefined)[]) {
	const data: CellWithRowAndCol[] = []

	let r = 0
	for (const row of rows) {
		let c = 0
		if (row) for (const cell of row) {
			if (typeof cell == 'object') {
				data.push({ r, c, v: cell })
			}
			c++
		}
		r++
	}

	console.log('transformCellData', data)
	return data
}

export function SheelloApp() {
	const { t } = useTranslation()
	const cloudillo = useCloudilloEditor(APP_NAME)
	//const yCells = cloudillo.yDoc.getMap<CellData>('cells')
	const meta = cloudillo.yDoc.getMap('meta')
	//const rows = cloudillo.yDoc.getMap<YRow | false>('rows')
	//const workbookConfig = cloudillo.yDoc.getXmlElement('config')
	const workbookConfig: YWorkbookConfig = cloudillo.yDoc.getMap('config')
	//const rows = cloudillo.yDoc.getArray<YRow | false>('rows')
	const [loaded, setLoaded] = React.useState(false)
	const [initialized, setInitialized] = React.useState(false)
	//const [currentSheet, setCurrentSheet] = React.useState<{ id: string, rows: YSheetRows } | undefined>()
	const [origCellData, setOrigCellData] = React.useState<FortuneSheet[] | undefined>()
	const workbookRef = React.useRef<WorkbookInstance>(null)

	React.useEffect(function () {
		if (!cloudillo.provider) return
		const sheetMap = cloudillo.yDoc.getMap<YSheetRows>('sheets')

		meta.observe(evts => {
			console.log('onLoad.meta', meta.toJSON())
			console.log('workbookConfig', workbookConfig.toJSON())

			// Activate first sheet
			let sheet: { id: string, rows: YSheetRows } | undefined
			for (const sh of workbookConfig.values()) {
				const id = sh.id
				let rows = sheetMap.get(id)
				if (!rows) {
					rows = new Y.Array()
					sheetMap.set(id, rows)
				}

				sheet = { id, rows }
				break
			}

			// Observe config events
			workbookConfig.observeDeep(evts => {
				if (!workbookRef.current) return
				console.log('[Y] config event', evts)

				let recalc = false
				for (const evt of evts) {
					applyConfigYEvent(workbookConfig, workbookRef.current, evt)
				}
				if (recalc) {
					console.log('Calling calculateFormula')
					workbookRef.current.calculateFormula()
				}
			})

			sheetMap.observeDeep(evts => {
				if (!workbookRef.current) return

				let recalc = false
				for (const evt of evts) {
					console.log('[Y] sheet event', evt.path, evt.transaction.local ? 'local' : 'remote', JSON.stringify(evt.delta, null, 4))
					const sheetId = evt.path[0]
					if (typeof sheetId == 'string') {
						let rows = sheetMap.get(sheetId)
						if (rows) recalc ||= applyYEvent(rows, workbookRef.current, evt)
					}
				}

				if (recalc) {
					console.log('Calling calculateFormula')
					workbookRef.current.calculateFormula()
				}
			})

			setLoaded(true)
		})

		// Add user presence
		;(async function () {
			cloudillo?.provider?.awareness.setLocalStateField('user', {
				name: cloudillo.idTag,
				color: await str2color(cloudillo.idTag ?? '')
			})
		})()

		let prevSheetName: string | undefined, prevRow: number | undefined, prevColumn: number | undefined
		const refreshInterval = setInterval(function () {
			if (!workbookRef.current || !cloudillo.provider) return

			// Show awareness
			cloudillo.provider.awareness.on('change', (evt: { added: number[], updated: number[], removed: number[] }) => {
				const sheetId = workbookRef?.current?.getSheet().id
				if (!sheetId) return

				if (evt.removed.length > 0) workbookRef?.current?.removePresences(evt.removed.map(p => ({ userId: '' + p, username: '' })))
				if (evt.added.length + evt.updated.length > 0) {
					const sheets = workbookRef?.current?.getAllSheets() || []
					const awareness = cloudillo?.provider?.awareness.getStates()!

					const presences = [...evt.added, ...evt.updated].map(p => {
						const state = awareness.get(p)
						//console.log('sheets', sheets)
						const sheetId = sheets.find(s => s.name == state?.cursor?.[0])?.id
						//console.log('cursor', sheetId, state?.cursor)
						return {
							userId: '' + p,
							username: state?.user?.name || '',
							sheetId: sheetId || '',
							color: '#f00',
							selection: { r: state?.cursor?.[1], c: state?.cursor?.[2] }
						}
					}).filter(p => p.selection?.r && cloudillo.yDoc.clientID != +p.userId)
					workbookRef?.current?.addPresences(presences)
				}
			})

			// Update awareness
			const selection = workbookRef.current.getSelection()
			const sheetName = workbookRef.current.getSheet().name
			const [row, column] = [selection?.[0].row[0], selection?.[0].column[0]]
			if (sheetName != prevSheetName || row != prevRow || column != prevColumn) {
				cloudillo.provider.awareness.setLocalStateField('cursor', [sheetName, row, column])
				prevSheetName = sheetName
				prevRow = row
				prevColumn = column
			}
		}, 1000)

		return function () {
			clearInterval(refreshInterval)
		}
	}, [cloudillo.provider])

	/*
	function afterActivateSheet(sheetId: string) {
		console.log('afterActivateSheet', sheetId)
		const sheetMap = cloudillo.yDoc.getMap<YSheetRows>('sheets')
		setCurrentSheet({ id: sheetId, rows: sheetMap.get(sheetId) || new Y.Array() })
	}
	*/

	React.useEffect(function () {
		if (loaded && !origCellData) {
			const data: FortuneSheet[] = []
			const workbookConfigArray = [...workbookConfig.values()].sort((s1: FortuneSheet, s2: FortuneSheet) => s1.order ?? 0 < (s2.order ?? 0) ? -1 : s1.order ?? 0 > (s2.order ?? 0) ? 1 : 0)

			if (workbookConfigArray.length) {
				for (const sheet of workbookConfigArray) {
					const sheetMap = cloudillo.yDoc.getMap<YSheetRows>('sheets')
					let rows = sheetMap.get(sheet.id)
					if (!rows) {
						rows = new Y.Array()
						sheetMap.set(sheet.id, rows)
					}
					data.push({ ...sheet, celldata: transformCellData(rows.toJSON()) })
				}
			} else {
				//const sheet = { id: '00000000-0000-0000-0000-00000000', name: t('Sheet') + 1 }
				const sheet = { id: '000000000000', name: t('Sheet') + 1 }
				workbookConfig.set(sheet.id, sheet)
				data.push(sheet)
			}
			console.log('origCellData', data)
			setOrigCellData(data)
			setInitialized(true)
		}
	}, [loaded, origCellData])

	React.useEffect(function () {
		if (!initialized) return

		console.log('Calling calculateFormula')
		workbookRef.current?.calculateFormula()
	}, [initialized])

	const onOp = React.useCallback(function onOp(ops: Op[]) {
		cloudillo.yDoc.transact(() => {
			for (const op of ops) {
				if (op.id) {
					const sheetMap = cloudillo.yDoc.getMap<YSheetRows>('sheets')
					let sheet = sheetMap.get(op.id)
					if (!sheet) {
						sheet = new Y.Array()
						sheetMap.set(op.id, sheet)
					}
					transformOp(workbookConfig, sheet, op)
				}
			}
		})
	}, [])

	console.log('Sheet render', origCellData)
	console.log('workbookConfig', workbookConfig.toJSON())
	return origCellData && <Workbook
		ref={workbookRef}
		data={origCellData}
		onOp={onOp}
		generateSheetId={generateId}
		//hooks={{ afterActivateSheet }}
	/>
}

// vim: ts=4
