// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Card,
	HBox,
	Panel,
	SortableGroup,
	SortableList,
	Text,
	useApi,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuRotateCcw as IcReset } from 'react-icons/lu'

import {
	applyMenuConfig,
	appConfig as defaultAppConfig,
	getAllMenuItems
} from '../manifest-registry.js'
import type { MenuItem } from '../utils.js'
import { useAppConfig } from '../utils.js'

const MAX_MAIN_ITEMS = 4

type Section = 'main' | 'extra' | 'available'

export function AppMenuSettings() {
	const { t, i18n } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const [appConfig, setAppConfig] = useAppConfig()

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

	// `to` is the item's index after the move (SortableList semantics)
	function move(source: Section, from: number, target: Section, to: number) {
		if (source === 'available' && target === 'available') return
		const lists = { main: [...mainIds], extra: [...extraIds], available: availableIds }
		const itemId = lists[source][from]
		if (!itemId) return

		// Don't allow removing last item from main
		if (source === 'main' && target !== 'main' && mainIds.length <= 1) return

		// Available items are derived, no removal needed
		if (source !== 'available') lists[source].splice(from, 1)

		// If main is full, bump last item to extra
		if (target === 'main' && source !== 'main' && lists.main.length >= MAX_MAIN_ITEMS) {
			lists.extra.unshift(lists.main.pop()!)
		}
		// Dropping into available = just removing from main/extra (already done)
		if (target !== 'available') lists[target].splice(to, 0, itemId)

		saveMenuConfig(lists.main, lists.extra)
	}

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

	const itemLabel = (item: MenuItem) => item.trans?.[i18n.language] || item.label

	function renderSection(section: Section, ids: string[], title: string, subtitle: string) {
		const items = ids.flatMap((id) => itemMap.get(id) ?? [])
		return (
			<Card
				variant="outline"
				color={section === 'main' ? 'primary' : undefined}
				padding={2}
				title={title}
				description={subtitle}
			>
				<SortableList
					group={section}
					items={items}
					getKey={(item) => item.id}
					getLabel={itemLabel}
					onReorder={(from, to, source) =>
						move((source as Section | undefined) ?? section, from, section, to)
					}
					renderItem={(item, { handle }) => (
						<HBox gap={2} align="center">
							{handle}
							{item.icon && React.createElement(item.icon)}
							<Text>{itemLabel(item)}</Text>
						</HBox>
					)}
				/>
				{items.length === 0 && (
					<Text as="div" size="sm" emphasis="muted" className="text-center">
						{t('Drag items here')}
					</Text>
				)}
			</Card>
		)
	}

	return (
		<Panel
			title={t('App menu')}
			actions={
				<Button size="sm" icon={<IcReset />} onClick={handleReset}>
					{t('Reset')}
				</Button>
			}
		>
			<SortableGroup>
				{renderSection(
					'main',
					mainIds,
					t('Main menu'),
					t('Up to {{count}} items shown in the navigation bar', {
						count: MAX_MAIN_ITEMS
					})
				)}
				{renderSection(
					'extra',
					extraIds,
					t('Extra menu'),
					t('Shown in the "More" overflow menu')
				)}
				{renderSection('available', availableIds, t('Available'), t('Not shown in menu'))}
			</SortableGroup>
		</Panel>
	)
}

// vim: ts=4
