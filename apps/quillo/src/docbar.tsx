// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Quillo's one React island.
 *
 * The editor and its `#toolbar` stay imperative — this mounts the shared DocBar
 * and nothing else. The imports go through `@cloudillo/react/doc-bar` rather
 * than the package index so `react-router-dom` stays out of the bundle: quillo
 * has no router and should not grow one to show a document name.
 *
 * JSX here is the CLASSIC runtime (`apps/tsconfig-app-base.json` sets
 * `"jsx": "react"`, which `createConfig` deliberately inherits), so React must
 * be in scope — hence the namespace import below.
 */

import { getAppBus } from '@cloudillo/core'
import {
	AppDocBar,
	DocBarMenu,
	MenuDivider,
	MenuItem,
	Toasts,
	useCopyEmbedLink,
	useLibTranslation,
	useToast
} from '@cloudillo/react/doc-bar'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
	PiDownloadSimpleBold as IcImport,
	PiLinkBold as IcLink,
	PiGearBold as IcSettings
} from 'react-icons/pi'
import type { Awareness } from 'y-protocols/awareness'

export interface DocBarActions {
	/** Open the Markdown file picker. Absent for a read-only viewer. */
	onImportMarkdown?: () => void
	/** Show the document settings dialog. Absent for a read-only viewer. */
	onOpenSettings?: () => void
	/** Embed link of the section at the cursor; null when there is none. Shown to readers too. */
	getSectionLink?: () => string | null
}

export interface MountDocBarOptions {
	awareness?: Awareness | null
	/**
	 * Everything the menu can offer. Whether any of it is SHOWN is decided here,
	 * from live bus state — pass them unconditionally.
	 */
	actions?: DocBarActions
}

function QuilloDocBar({ awareness, actions }: MountDocBarOptions) {
	const { t } = useLibTranslation()
	// Not a mount-time snapshot: on a share-link mount the shell sends a
	// corrective `auth:init.push` once auth resolves, which can turn a reader
	// into a writer. The Quill toolbar becomes editable on its own; without this
	// the DocBar menu would stay empty until a reload.
	const [canWrite, setCanWrite] = React.useState(() => getAppBus().access === 'write')

	React.useEffect(() => {
		const bus = getAppBus()
		// Re-read on subscribe: the push may have landed between the initial
		// state above and this effect.
		setCanWrite(bus.access === 'write')
		return bus.onIdentityChange(() => setCanWrite(bus.access === 'write'))
	}, [])

	// Gated on write access rather than on the toolbar's visibility: the toolbar
	// is hidden in read-only, but the DocBar is not.
	const hasActions = canWrite && !!(actions?.onImportMarkdown || actions?.onOpenSettings)
	const toast = useToast()
	const copyEmbedLink = useCopyEmbedLink()

	const getSectionLink = actions?.getSectionLink
	function copySectionLink() {
		const link = getSectionLink?.()
		if (link) copyEmbedLink(link)
		else toast.warning(t('Place the cursor in a section with a heading'))
	}

	return (
		<React.Fragment>
			<AppDocBar awareness={awareness}>
				{(hasActions || getSectionLink) && (
					<DocBarMenu>
						{getSectionLink && (
							<MenuItem
								icon={<IcLink />}
								label={t('Copy embed link to this section')}
								onClick={copySectionLink}
							/>
						)}
						{getSectionLink && hasActions && <MenuDivider />}
						{hasActions && actions?.onImportMarkdown && (
							<MenuItem
								icon={<IcImport />}
								label={t('Import Markdown')}
								onClick={actions.onImportMarkdown}
							/>
						)}
						{hasActions && actions?.onImportMarkdown && actions?.onOpenSettings && (
							<MenuDivider />
						)}
						{hasActions && actions?.onOpenSettings && (
							<MenuItem
								icon={<IcSettings />}
								label={t('Document Settings')}
								onClick={actions.onOpenSettings}
							/>
						)}
					</DocBarMenu>
				)}
			</AppDocBar>
			<Toasts />
		</React.Fragment>
	)
}

/**
 * Render the DocBar into `el`. Call once, after the Yjs document is open.
 *
 * @returns The React root, so a caller could unmount it. Quillo never does.
 */
export function mountDocBar(el: HTMLElement, options: MountDocBarOptions = {}): Root {
	const root = createRoot(el)
	root.render(<QuilloDocBar {...options} />)
	return root
}

// vim: ts=4
