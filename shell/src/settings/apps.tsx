// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
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

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuGripVertical as IcGrip, LuRotateCcw as IcReset } from 'react-icons/lu'

import { useApi, useToast, mergeClasses } from '@cloudillo/react'

import type { MenuItem } from '../utils.js'
import { useAppConfig } from '../utils.js'
import {
	appConfig as defaultAppConfig,
	getAllMenuItems,
	applyMenuConfig
} from '../manifest-registry.js'

const MAX_MAIN_ITEMS = 4

interface DragSource {
	section: 'main' | 'extra' | 'available'
	index: number
}

function MenuItemRow({
	item,
	draggable,
	isDragging,
	isDragOver,
	language,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd
}: {
	item: MenuItem
	draggable: boolean
	isDragging: boolean
	isDragOver: boolean
	language: string
	onDragStart: (e: React.DragEvent) => void
	onDragOver: (e: React.DragEvent) => void
	onDrop: (e: React.DragEvent) => void
	onDragEnd: () => void
}) {
	return (
		<div
			className={mergeClasses(
				'c-app-menu-item',
				isDragging && 'dragging',
				isDragOver && 'drag-over'
			)}
			draggable={draggable}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
		>
			<IcGrip className="c-app-menu-grip" />
			{item.icon && React.createElement(item.icon)}
			<span>{item.trans?.[language] || item.label}</span>
		</div>
	)
}

export function AppMenuSettings() {
	const { t, i18n } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const [appConfig, setAppConfig] = useAppConfig()

	const [dragSource, setDragSource] = React.useState<DragSource | null>(null)
	const [dragOver, setDragOver] = React.useState<DragSource | null>(null)

	const allItems = React.useMemo(() => getAllMenuItems(), [])
	const itemMap = React.useMemo(
		() => new Map(allItems.map((item) => [item.id, item])),
		[allItems]
	)

	// Derive main/extra from current appConfig menu (already set during login)
	const currentMenu = appConfig?.menu ?? defaultAppConfig.menu
	const mainIds = React.useMemo(
		() => currentMenu.slice(0, MAX_MAIN_ITEMS).map((m) => m.id),
		[currentMenu]
	)
	const extraIds = React.useMemo(
		() => currentMenu.slice(MAX_MAIN_ITEMS).map((m) => m.id),
		[currentMenu]
	)

	// Derive available items (not in main or extra)
	const usedIds = React.useMemo(() => new Set([...mainIds, ...extraIds]), [mainIds, extraIds])
	const availableIds = React.useMemo(
		() => allItems.filter((item) => !usedIds.has(item.id)).map((item) => item.id),
		[allItems, usedIds]
	)

	// Save and apply menu config
	const saveMenuConfig = React.useCallback(
		async (newMain: string[], newExtra: string[]) => {
			if (!api || !appConfig) return

			const prevConfig = appConfig
			const menuSetting = { main: newMain, extra: newExtra }
			const newConfig = applyMenuConfig(appConfig, menuSetting)
			setAppConfig(newConfig)

			try {
				await api.settings.update('ui.app_menu', { value: menuSetting })
			} catch (err) {
				console.error('Failed to save app menu setting:', err)
				setAppConfig(prevConfig)
				toastError(t('Failed to save menu configuration.'))
			}
		},
		[api, appConfig, setAppConfig, toastError, t]
	)

	// Get the list for a section
	const getList = React.useCallback(
		(section: 'main' | 'extra' | 'available'): string[] => {
			switch (section) {
				case 'main':
					return mainIds
				case 'extra':
					return extraIds
				case 'available':
					return availableIds
			}
		},
		[mainIds, extraIds, availableIds]
	)

	// DnD handlers
	const handleDragStart = React.useCallback(
		(e: React.DragEvent, section: DragSource['section'], index: number) => {
			setDragSource({ section, index })
			e.dataTransfer.effectAllowed = 'move'
		},
		[]
	)

	const handleDragOver = React.useCallback(
		(e: React.DragEvent, section: DragSource['section'], index: number) => {
			e.preventDefault()
			setDragOver({ section, index })
		},
		[]
	)

	const handleDragEnd = React.useCallback(() => {
		setDragSource(null)
		setDragOver(null)
	}, [])

	const handleDrop = React.useCallback(
		(e: React.DragEvent, targetSection: DragSource['section'], targetIndex: number) => {
			e.preventDefault()
			if (!dragSource) return

			const sourceList = [...getList(dragSource.section)]
			const itemId = sourceList[dragSource.index]
			if (!itemId) return

			// Don't allow removing last item from main
			if (dragSource.section === 'main' && mainIds.length <= 1 && targetSection !== 'main') {
				setDragSource(null)
				setDragOver(null)
				return
			}

			// Remove from source
			const newMain = [...mainIds]
			const newExtra = [...extraIds]

			if (dragSource.section === 'main') {
				newMain.splice(dragSource.index, 1)
			} else if (dragSource.section === 'extra') {
				newExtra.splice(dragSource.index, 1)
			}
			// Available items are derived, no removal needed

			// Insert at target
			if (targetSection === 'main') {
				// If main is full, bump last item to extra
				if (newMain.length >= MAX_MAIN_ITEMS && dragSource.section !== 'main') {
					const bumped = newMain.pop()!
					newExtra.unshift(bumped)
				}
				newMain.splice(targetIndex, 0, itemId)
			} else if (targetSection === 'extra') {
				newExtra.splice(targetIndex, 0, itemId)
			}
			// Dropping into available = just removing from main/extra (already done)

			setDragSource(null)
			setDragOver(null)
			saveMenuConfig(newMain, newExtra)
		},
		[dragSource, mainIds, extraIds, getList, saveMenuConfig]
	)

	const handleSectionDrop = React.useCallback(
		(e: React.DragEvent, section: DragSource['section']) => {
			// Drop at the end of the section
			const list = getList(section)
			handleDrop(e, section, list.length)
		},
		[getList, handleDrop]
	)

	const handleReset = React.useCallback(async () => {
		const prevConfig = appConfig
		// Reset to static default menu
		setAppConfig(defaultAppConfig)

		if (!api) return
		try {
			const defaultMenu = defaultAppConfig.menu
			await api.settings.update('ui.app_menu', {
				value: {
					main: defaultMenu.slice(0, MAX_MAIN_ITEMS).map((m) => m.id),
					extra: defaultMenu.slice(MAX_MAIN_ITEMS).map((m) => m.id)
				}
			})
		} catch (err) {
			console.error('Failed to reset app menu setting:', err)
			if (prevConfig) setAppConfig(prevConfig)
			toastError(t('Failed to reset menu configuration.'))
		}
	}, [api, appConfig, setAppConfig, toastError, t])

	function renderSection(
		section: DragSource['section'],
		ids: string[],
		title: string,
		subtitle: string
	) {
		return (
			<div
				className={mergeClasses('c-app-menu-section', `c-app-menu-section--${section}`)}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => handleSectionDrop(e, section)}
			>
				<div className="c-app-menu-section-header">
					<h4>{title}</h4>
					<small className="text-muted">{subtitle}</small>
				</div>
				{ids.map((id, index) => {
					const item = itemMap.get(id)
					if (!item) return null
					return (
						<MenuItemRow
							key={id}
							item={item}
							draggable
							isDragging={
								dragSource?.section === section && dragSource.index === index
							}
							isDragOver={dragOver?.section === section && dragOver.index === index}
							language={i18n.language}
							onDragStart={(e) => handleDragStart(e, section, index)}
							onDragOver={(e) => handleDragOver(e, section, index)}
							onDrop={(e) => handleDrop(e, section, index)}
							onDragEnd={handleDragEnd}
						/>
					)
				})}
				{ids.length === 0 && (
					<div className="c-app-menu-empty text-muted">{t('Drag items here')}</div>
				)}
			</div>
		)
	}

	return (
		<div className="c-panel c-vbox g-2">
			<div className="c-hbox g-2 align-center">
				<h3 className="flex-fill">{t('App menu')}</h3>
				<button
					className="c-button small"
					onClick={handleReset}
					title={t('Reset to defaults')}
				>
					<IcReset /> {t('Reset')}
				</button>
			</div>

			{renderSection(
				'main',
				mainIds,
				t('Main menu'),
				t('Up to {{count}} items shown in the navigation bar', { count: MAX_MAIN_ITEMS })
			)}
			{renderSection(
				'extra',
				extraIds,
				t('Extra menu'),
				t('Shown in the "More" overflow menu')
			)}
			{renderSection('available', availableIds, t('Available'), t('Not shown in menu'))}
		</div>
	)
}

// vim: ts=4
