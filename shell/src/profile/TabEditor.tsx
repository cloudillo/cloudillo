// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Field, HBox, Input, NativeSelect, Panel, SortableList, Toggle } from '@cloudillo/react'
import type { TabEntry } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { getEffectiveTabs, LOCKED_TABS, type TabConfig } from './about/types.js'

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

	function defaultLabel(tab: TabEntry): string {
		if (tab.id === 'connections') return isCommunity ? t('Members') : t('Connections')
		return t(TAB_LABELS[tab.id] || tab.id)
	}

	function updateTab(id: string, patch: Partial<TabEntry>) {
		const next = tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab))
		onChange({ tabs: next, defaultTab })
	}

	function updateDefaultTab(id: string) {
		onChange({ tabs, defaultTab: id })
	}

	function reorder(from: number, to: number) {
		const next = [...tabs]
		const [moved] = next.splice(from, 1)
		next.splice(to, 0, moved)
		onChange({ tabs: next.map((tab, i) => ({ ...tab, order: i })), defaultTab })
	}

	const visibleTabs = tabs.filter((tab) => tab.visible)

	return (
		<Panel padding={3} title={t('Profile Tabs')} headingLevel={4}>
			<SortableList
				items={tabs}
				getKey={(tab) => tab.id}
				getLabel={(tab) => tab.label || defaultLabel(tab)}
				onReorder={reorder}
				renderItem={(tab, { handle }) => (
					<HBox gap={2} align="center" padding={1}>
						{handle}
						<Toggle
							color="primary"
							aria-label={t('Show tab')}
							checked={tab.visible}
							disabled={LOCKED_TABS.includes(tab.id)}
							onChange={(e) => updateTab(tab.id, { visible: e.target.checked })}
						/>
						<Input
							className="flex-fill"
							aria-label={t('Tab label')}
							placeholder={defaultLabel(tab)}
							value={tab.label || ''}
							onChange={(e) =>
								updateTab(tab.id, { label: e.target.value || undefined })
							}
						/>
					</HBox>
				)}
			/>

			<Field label={t('Default tab')} orientation="horizontal">
				<NativeSelect value={defaultTab} onChange={(e) => updateDefaultTab(e.target.value)}>
					{visibleTabs.map((tab) => (
						<option key={tab.id} value={tab.id}>
							{tab.label || t(TAB_LABELS[tab.id] || tab.id)}
						</option>
					))}
				</NativeSelect>
			</Field>
		</Panel>
	)
}

// vim: ts=4
