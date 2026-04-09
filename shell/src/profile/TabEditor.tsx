// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuGripVertical as IcDrag } from 'react-icons/lu'

import type { TabEntry } from '@cloudillo/types'

import { LOCKED_TABS, getEffectiveTabs, type TabConfig } from './about/types.js'

// ============================================================================
// Default tab labels (i18n keys = English strings)
// ============================================================================

const TAB_LABELS: Record<string, string> = {
	feed: 'Feed',
	about: 'About',
	connections: 'Connections',
	gallery: 'Gallery',
	files: 'Files'
}

// ============================================================================
// TabEditor component
// ============================================================================

interface TabEditorProps {
	tabConfig?: TabConfig
	onChange: (config: TabConfig) => void
	isCommunity?: boolean
}

export function TabEditor({ tabConfig, onChange, isCommunity }: TabEditorProps) {
	const { t } = useTranslation()
	const tabs = getEffectiveTabs(tabConfig)
	const defaultTab = tabConfig?.defaultTab || tabs.find((tab) => tab.visible)?.id || 'feed'

	// Drag state: fromIndex is set on drag start, overIndex tracks the current drop target
	const [dragFrom, setDragFrom] = React.useState<number | null>(null)
	const [dragOver, setDragOver] = React.useState<number | null>(null)

	function updateTab(id: string, patch: Partial<TabEntry>) {
		const next = tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab))
		onChange({ tabs: next, defaultTab })
	}

	function updateDefaultTab(id: string) {
		onChange({ tabs, defaultTab: id })
	}

	function onDragStart(e: React.DragEvent, index: number) {
		setDragFrom(index)
		e.dataTransfer.effectAllowed = 'move'
	}

	function onDragOver(e: React.DragEvent, index: number) {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		if (dragFrom === null || index === dragFrom) {
			setDragOver(null)
			return
		}
		setDragOver(index)
	}

	function onDrop(e: React.DragEvent, toIndex: number) {
		e.preventDefault()
		if (dragFrom === null || dragFrom === toIndex) return
		const next = [...tabs]
		const [moved] = next.splice(dragFrom, 1)
		next.splice(toIndex, 0, moved)
		next.forEach((tab, i) => {
			tab.order = i
		})
		onChange({ tabs: next, defaultTab })
		setDragFrom(null)
		setDragOver(null)
	}

	function onDragEnd() {
		setDragFrom(null)
		setDragOver(null)
	}

	const visibleTabs = tabs.filter((tab) => tab.visible)

	return (
		<div className="c-panel p-3 c-vbox g-3">
			<h4 className="pb-2 border-bottom mb-1">{t('Profile Tabs')}</h4>

			<div className="c-vbox">
				{tabs.map((tab, index) => {
					const isLocked = LOCKED_TABS.includes(tab.id)
					const defaultLabel =
						tab.id === 'connections'
							? isCommunity
								? t('Members')
								: t('Connections')
							: t(TAB_LABELS[tab.id] || tab.id)

					const isDragged = dragFrom === index
					const isDropTarget = dragOver === index

					return (
						<div
							key={tab.id}
							className="c-hbox g-2 align-items-center p-1"
							style={{
								opacity: isDragged ? 0.4 : 1,
								borderTop:
									isDropTarget && dragFrom !== null && dragFrom > index
										? '2px solid var(--col-primary)'
										: undefined,
								borderBottom:
									isDropTarget && dragFrom !== null && dragFrom < index
										? '2px solid var(--col-primary)'
										: undefined,
								transition: 'border 0.1s ease'
							}}
							draggable
							onDragStart={(e) => onDragStart(e, index)}
							onDragOver={(e) => onDragOver(e, index)}
							onDrop={(e) => onDrop(e, index)}
							onDragEnd={onDragEnd}
						>
							<span style={{ cursor: 'grab', opacity: 0.5, touchAction: 'none' }}>
								<IcDrag />
							</span>
							<input
								className="c-toggle primary"
								type="checkbox"
								checked={tab.visible}
								disabled={isLocked}
								onChange={(e) => updateTab(tab.id, { visible: e.target.checked })}
							/>
							<input
								className="c-input flex-fill"
								placeholder={defaultLabel}
								value={tab.label || ''}
								onChange={(e) =>
									updateTab(tab.id, { label: e.target.value || undefined })
								}
							/>
						</div>
					)
				})}
			</div>

			<label className="c-settings-field">
				<span>{t('Default tab')}</span>
				<select
					className="c-select"
					value={defaultTab}
					onChange={(e) => updateDefaultTab(e.target.value)}
				>
					{visibleTabs.map((tab) => (
						<option key={tab.id} value={tab.id}>
							{tab.label || t(TAB_LABELS[tab.id] || tab.id)}
						</option>
					))}
				</select>
			</label>
		</div>
	)
}

// vim: ts=4
