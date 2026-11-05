// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { decodeImportText, getAppBus, refuseImport } from '@cloudillo/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createPage } from '../rtdb/page-ops.js'
import { ROOT_PARENT } from '../rtdb/types.js'

interface ImportPushOptions {
	client?: RtdbClient
	idTag?: string
	/** The page for the pushed file exists; the caller fills it and reports to the shell. */
	onCreated(pageId: string, markdown: string): void
}

/** The file the shell pushes: a new top-level page, once there is a client to make it with. */
export function useImportPush({ client, idTag, onCreated }: ImportPushOptions) {
	const { t } = useTranslation()
	/** Latest render's values: a language change must not cancel the run and make a second page. */
	const now = React.useRef({ t, onCreated })
	now.current = { t, onCreated }

	// In state, so the processing effect also runs for a push after the client is ready.
	const [importPayload, setImportPayload] = React.useState<{
		markdown: string
		fileName: string
	} | null>(null)

	// Registered early: no dependency on the client.
	React.useEffect(() => {
		const bus = getAppBus()
		return bus.onImportData(({ sourceMimeType: type, fileName, data }) => {
			const { t } = now.current
			if (refuseImport(bus, type, t)) return
			try {
				setImportPayload({ markdown: decodeImportText(data), fileName })
			} catch (err) {
				console.error('[Notillo] Markdown import failed:', err)
				bus.notifyImportComplete(false, t('Could not import the file'))
			}
		})
	}, [])

	React.useEffect(() => {
		if (!client || !idTag || !importPayload) return
		const { markdown, fileName } = importPayload

		let cancelled = false
		;(async () => {
			try {
				const title = fileName.replace(/\.[^.]+$/, '') || 'Imported'
				const pageId = await createPage(client, idTag, title, ROOT_PARENT)
				if (cancelled) return
				now.current.onCreated(pageId, markdown)
			} catch (err) {
				if (cancelled) return
				console.error('[Notillo] Markdown import failed:', err)
				getAppBus().notifyImportComplete(false, now.current.t('Could not import the file'))
			}
			setImportPayload(null)
		})()
		return () => {
			cancelled = true
		}
	}, [client, idTag, importPayload])
}

// vim: ts=4
