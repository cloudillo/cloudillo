// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'
import { ActionBar } from '../ActionBar/index.js'
import { Button } from '../Button/index.js'
import { Dialog } from '../Dialog/index.js'
import { Progress } from '../Progress/index.js'

/** Embed renders done of total, plus an optional overall percent */
export interface ExportProgressState {
	done: number
	total: number
	pct?: number
}

export interface ExportTaskHandle {
	signal: AbortSignal
	/** Merged into the current state, so independent sources can report separately */
	setProgress: (p: Partial<ExportProgressState>) => void
}

/** Cancel only once the export is visibly taking a while */
const CANCELABLE_AFTER_MS = 1000

/** Progress and cancel for one export at a time; `progress` is null when none runs */
export function useExportProgress() {
	const [progress, setProgressState] = React.useState<ExportProgressState | null>(null)
	const [cancelable, setCancelable] = React.useState(false)
	const abortRef = React.useRef<AbortController | null>(null)

	const run = React.useCallback(
		async <T,>(task: (h: ExportTaskHandle) => Promise<T>): Promise<T | undefined> => {
			// One export at a time: a second one started meanwhile is a no-op
			if (abortRef.current) return undefined
			const abort = new AbortController()
			abortRef.current = abort
			setCancelable(false)
			setProgressState({ done: 0, total: 0 })
			const timer = setTimeout(() => setCancelable(true), CANCELABLE_AFTER_MS)
			try {
				const result = await task({
					signal: abort.signal,
					// A canceled task that keeps going must not move the next export's bar
					setProgress: (p) => {
						if (!abort.signal.aborted)
							setProgressState((prev) => prev && { ...prev, ...p })
					}
				})
				// Canceled, but the task ignored the signal: drop its result
				return abort.signal.aborted ? undefined : result
			} catch (err) {
				if (abort.signal.aborted) return undefined
				throw err
			} finally {
				clearTimeout(timer)
				if (abortRef.current === abort) {
					abortRef.current = null
					setProgressState(null)
				}
			}
		},
		[]
	)

	// Closes the dialog at once, even when the task can't stop (it settles later, unseen)
	const abort = React.useCallback(() => {
		const a = abortRef.current
		if (!a) return
		a.abort()
		abortRef.current = null
		setProgressState(null)
	}, [])

	return { progress, cancelable, run, abort }
}

export interface ExportProgressDialogProps {
	title: string
	/** Shown once the embeds are rendered */
	busyLabel: string
	progress: ExportProgressState | null
	cancelable: boolean
	onCancel: () => void
}

/** Modal progress for {@link useExportProgress}; renders nothing while no export runs */
export function ExportProgressDialog({
	title,
	busyLabel,
	progress,
	cancelable,
	onCancel
}: ExportProgressDialogProps): React.ReactElement | null {
	const { t } = useLibTranslation()
	if (!progress) return null
	const { done, total, pct } = progress
	return (
		<Dialog
			open
			size="sm"
			title={title}
			dismissable={false}
			footer={
				cancelable && (
					<ActionBar>
						<Button onClick={onCancel}>{t('Cancel')}</Button>
					</ActionBar>
				)
			}
		>
			<div className="c-vbox g-2">
				<span>
					{done < total
						? t('Preparing embeds {{n}} of {{m}}…', { n: done + 1, m: total })
						: busyLabel}
				</span>
				<Progress value={pct} indeterminate={pct == null || done < total} />
			</div>
		</Dialog>
	)
}

// vim: ts=4
