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

import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { PiPlusBold as IcPlus, PiTrashBold as IcDelete } from 'react-icons/pi'

import { RtdbClient } from '@cloudillo/rtdb'
import { getAppBus } from '@cloudillo/base'
import { Panel } from '@cloudillo/react'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './style.css'

import { Task, TaskFilter } from './types.js'

const APP_NAME = 'taskillo'

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook: useTaskillo
 *
 * Handles Cloudillo app initialization and RTDB client setup.
 * This demonstrates the complete initialization flow:
 * 1. Parse document ID from URL hash
 * 2. Initialize cloudillo SDK (get auth token from parent shell)
 * 3. Create RTDB client with WebSocket connection
 * 4. Connect to the real-time database
 */
function useTaskillo() {
	const location = useLocation()
	const [client, setClient] = React.useState<RtdbClient | undefined>()
	const [connected, setConnected] = React.useState(false)
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<Error | undefined>()
	const [fileId, setFileId] = React.useState('')
	const [idTag, setIdTag] = React.useState<string | undefined>()
	const [access, setAccess] = React.useState<'read' | 'write'>('write')

	// Parse document ID from URL hash
	// Cloudillo apps receive the document ID in the format: #tenant:path
	// Example: #alice:tasks/work -> fileId = "tasks/work"
	React.useEffect(() => {
		const resId = location.hash.slice(1) // Remove # prefix
		const [, path] = resId.split(':')
		setFileId(path || '')
	}, [location.hash])

	// Initialize cloudillo and rtdb client
	React.useEffect(() => {
		if (!fileId) return
		let rtdbClient: RtdbClient | undefined
		let unmounted = false

		;(async () => {
			try {
				setLoading(true)
				setError(undefined)

				// Step 1: Initialize cloudillo SDK
				// This waits for the parent shell to send an init message with the auth token
				// Apps run in iframes and communicate with the shell via postMessage
				console.log('[Taskillo] Initializing cloudillo...')
				const bus = getAppBus()
				const state = await bus.init(APP_NAME)
				console.log('[Taskillo] Token received')
				setIdTag(bus.idTag)
				setAccess(bus.access)

				if (unmounted) return

				// Step 2: Determine WebSocket server URL
				// Use wss:// for HTTPS, ws:// for HTTP
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
				const serverUrl = `${protocol}//${window.location.host}`

				// Step 3: Create RTDB client
				// The client manages the WebSocket connection and provides the database API
				console.log('[Taskillo] Creating RTDB client...')
				rtdbClient = new RtdbClient({
					dbId: fileId, // Document/database identifier
					auth: {
						getToken: () => state.accessToken // Auth token from bus.init()
					},
					serverUrl, // WebSocket server URL
					options: {
						enableCache: true, // Cache data locally
						reconnect: true, // Auto-reconnect on disconnect
						reconnectDelay: 1000, // Initial reconnect delay (ms)
						maxReconnectDelay: 30000, // Max reconnect delay (ms)
						debug: false // Disable debug logging
					}
				})

				// Step 4: Connect to the real-time database
				// This establishes the WebSocket connection
				console.log('[Taskillo] Connecting to RTDB...')
				await rtdbClient.connect()

				if (unmounted) {
					await rtdbClient.disconnect()
					return
				}

				console.log('[Taskillo] Connected to RTDB')
				setClient(rtdbClient)
				setConnected(true)
				setLoading(false)
			} catch (err) {
				console.error('[Taskillo] Initialization error:', err)
				if (!unmounted) {
					setError(err as Error)
					setLoading(false)
				}
			}
		})()

		// Cleanup
		return () => {
			unmounted = true
			if (rtdbClient) {
				rtdbClient.disconnect().catch(console.error)
			}
		}
	}, [fileId])

	return {
		client,
		fileId,
		idTag,
		access,
		connected,
		error,
		loading
	}
}

/**
 * Hook: useTasks
 *
 * Manages task CRUD operations and filtering.
 * This demonstrates the core pattern for using Cloudillo's real-time database:
 * 1. Subscribe to a collection with onSnapshot()
 * 2. Receive automatic updates when data changes
 * 3. Perform CRUD operations using the RTDB client
 */
function useTasks(client: RtdbClient | undefined, fileId: string, idTag: string | undefined) {
	const [tasks, setTasks] = React.useState<Task[]>([])
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<Error | undefined>()
	const [filter, setFilter] = React.useState<TaskFilter>('all')

	// Subscribe to task updates from the real-time database
	// This is the key to collaborative editing - all clients get notified of changes!
	React.useEffect(() => {
		if (!client || !fileId) {
			setLoading(false)
			return
		}

		setLoading(true)
		setError(undefined)

		const collectionRef = client.collection('tasks')

		// onSnapshot creates a real-time subscription
		// The callback fires whenever ANY client creates, updates, or deletes a task
		const unsubscribe = collectionRef.onSnapshot(
			(snapshot) => {
				const taskList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data()
				})) as Task[]
				setTasks(taskList)
				setLoading(false)
			},
			(err) => {
				console.error('[useTasks] Subscription error:', err)
				setError(err as Error)
				setLoading(false)
			}
		)

		// Cleanup: unsubscribe when component unmounts
		return () => {
			unsubscribe()
		}
	}, [client, fileId])

	// Create a new task
	const createTask = React.useCallback(
		async (text: string) => {
			if (!client || !fileId) return

			await client.collection('tasks').create({
				text,
				completed: false,
				createdAt: new Date().toISOString()
			})
		},
		[client, fileId]
	)

	// Update task properties
	const updateTask = React.useCallback(
		async (id: string, updates: Partial<Task>) => {
			if (!client || !fileId) return

			await client.ref(`tasks/${id}`).update(updates)
		},
		[client, fileId]
	)

	// Delete a task
	const deleteTask = React.useCallback(
		async (id: string) => {
			if (!client || !fileId) return

			await client.ref(`tasks/${id}`).delete()
		},
		[client, fileId]
	)

	// Toggle task completion status
	const toggleTask = React.useCallback(
		async (id: string) => {
			const task = tasks.find((t) => t.id === id)
			if (!task) return

			await updateTask(id, { completed: !task.completed })
		},
		[tasks, updateTask]
	)

	// Apply filter to tasks
	const filteredTasks = React.useMemo(() => {
		switch (filter) {
			case 'active':
				return tasks.filter((t) => !t.completed)
			case 'completed':
				return tasks.filter((t) => t.completed)
			case 'all':
			default:
				return tasks
		}
	}, [tasks, filter])

	// Calculate simple statistics
	const stats = React.useMemo(
		() => ({
			totalCount: tasks.length,
			activeCount: tasks.filter((t) => !t.completed).length,
			completedCount: tasks.filter((t) => t.completed).length
		}),
		[tasks]
	)

	return {
		tasks: filteredTasks,
		loading,
		error,
		createTask,
		updateTask,
		deleteTask,
		toggleTask,
		filter,
		setFilter,
		...stats
	}
}

// =============================================================================
// COMPONENTS
// =============================================================================

/**
 * Component: Header
 *
 * Displays app title, task statistics, and connection status
 */
function Header({
	connected,
	totalCount,
	activeCount,
	completedCount
}: {
	connected: boolean
	totalCount: number
	activeCount: number
	completedCount: number
}) {
	return (
		<Panel className="taskillo-header">
			<h1 className="header-title">Taskillo</h1>

			<div className="header-stats">
				<span title="Total tasks">{totalCount} total</span>
				<span title="Active tasks">{activeCount} active</span>
				<span title="Completed tasks">{completedCount} done</span>
			</div>

			<div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
				<div className="status-indicator" />
				<span>{connected ? 'Connected' : 'Disconnected'}</span>
			</div>
		</Panel>
	)
}

/**
 * Component: FilterBar
 *
 * Simple filter buttons for All/Active/Completed views.
 * In a real-time collaborative app, filtering happens locally for each user.
 */
function FilterBar({
	filter,
	onFilterChange
}: {
	filter: TaskFilter
	onFilterChange: (filter: TaskFilter) => void
}) {
	return (
		<Panel className="filter-bar flex-row g-1 flex-wrap">
			<button
				className={`filter-button ${filter === 'all' ? 'active' : ''}`}
				onClick={() => onFilterChange('all')}
			>
				All
			</button>
			<button
				className={`filter-button ${filter === 'active' ? 'active' : ''}`}
				onClick={() => onFilterChange('active')}
			>
				Active
			</button>
			<button
				className={`filter-button ${filter === 'completed' ? 'active' : ''}`}
				onClick={() => onFilterChange('completed')}
			>
				Completed
			</button>
		</Panel>
	)
}

/**
 * Component: TaskInput
 *
 * Input form for creating new tasks
 */
function TaskInput({
	onCreateTask,
	disabled
}: {
	onCreateTask: (text: string) => Promise<void>
	disabled?: boolean
}) {
	const [text, setText] = React.useState('')
	const [loading, setLoading] = React.useState(false)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!text.trim() || disabled || loading) return

		try {
			setLoading(true)
			await onCreateTask(text)
			setText('')
		} catch (err) {
			console.error('Failed to create task:', err)
		} finally {
			setLoading(false)
		}
	}

	const handleKeyPress = async (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			await handleSubmit(e as any)
		}
	}

	return (
		<Panel className="task-input-panel">
			<form onSubmit={handleSubmit} className="task-input-container">
				<input
					type="text"
					className="task-input"
					placeholder={
						disabled && !loading
							? 'View-only mode'
							: 'Add a new task... (press Enter to add)'
					}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyPress={handleKeyPress}
					disabled={disabled || loading}
				/>

				<button
					type="submit"
					disabled={!text.trim() || disabled || loading}
					className="c-button primary"
					style={{ padding: '0.5rem 1rem' }}
				>
					<IcPlus /> {loading ? 'Adding...' : 'Add'}
				</button>
			</form>
		</Panel>
	)
}

/**
 * Component: TaskItem
 *
 * Individual task with checkbox and delete button
 */
function TaskItem({
	task,
	onToggle,
	onDelete,
	readOnly
}: {
	task: Task
	onToggle: (id: string) => Promise<void>
	onDelete: (id: string) => Promise<void>
	readOnly?: boolean
}) {
	const [loading, setLoading] = React.useState(false)
	const [deleting, setDeleting] = React.useState(false)

	const handleToggle = async () => {
		try {
			setLoading(true)
			await onToggle(task.id)
		} catch (err) {
			console.error('Failed to toggle task:', err)
		} finally {
			setLoading(false)
		}
	}

	const handleDelete = async () => {
		if (!confirm('Are you sure you want to delete this task?')) return

		try {
			setDeleting(true)
			await onDelete(task.id)
		} catch (err) {
			console.error('Failed to delete task:', err)
		} finally {
			setDeleting(false)
		}
	}

	return (
		<div className={`task-item ${task.completed ? 'completed' : ''}`}>
			<input
				type="checkbox"
				className="task-checkbox"
				checked={task.completed}
				onChange={handleToggle}
				disabled={loading || readOnly}
				aria-label={`Mark "${task.text}" as ${task.completed ? 'incomplete' : 'complete'}`}
			/>

			<span className="task-title">{task.text}</span>

			{!readOnly && (
				<div className="task-actions">
					<button
						onClick={handleDelete}
						disabled={deleting}
						className="c-button icon danger small"
						title="Delete task"
						aria-label={`Delete "${task.text}"`}
					>
						<IcDelete />
					</button>
				</div>
			)}
		</div>
	)
}

/**
 * Component: TaskList
 *
 * Renders the list of tasks or an empty state
 */
function TaskList({
	tasks,
	loading,
	onToggleTask,
	onUpdateTask,
	onDeleteTask,
	readOnly
}: {
	tasks: Task[]
	loading: boolean
	onToggleTask: (id: string) => Promise<void>
	onUpdateTask: (id: string, updates: Partial<Task>) => Promise<void>
	onDeleteTask: (id: string) => Promise<void>
	readOnly?: boolean
}) {
	if (loading && tasks.length === 0) {
		return (
			<div className="empty-state">
				<div className="c-spinner" />
				<p className="empty-state-text">Loading tasks...</p>
			</div>
		)
	}

	if (tasks.length === 0) {
		return (
			<div className="empty-state">
				<div className="empty-state-icon">📭</div>
				<p className="empty-state-text">No tasks here!</p>
				<small>Add a task above to get started.</small>
			</div>
		)
	}

	return (
		<div>
			{tasks.map((task) => (
				<TaskItem
					key={task.id}
					task={task}
					onToggle={onToggleTask}
					onDelete={onDeleteTask}
					readOnly={readOnly}
				/>
			))}
		</div>
	)
}

// =============================================================================
// MAIN APP
// =============================================================================

/**
 * Taskillo Main App Component
 *
 * This is a simple tutorial demonstrating Cloudillo's real-time database (RTDB).
 * It shows the essential patterns for building collaborative applications:
 *
 * 1. Initialize connection (useTaskillo hook)
 * 2. Subscribe to data changes (useTasks hook)
 * 3. Perform CRUD operations (create, update, delete)
 * 4. Display real-time updates from other users
 *
 * The entire app is in this single file for easy learning!
 */
export function TaskilloApp() {
	// Initialize Cloudillo connection and RTDB client
	const taskillo = useTaskillo()
	const isReadOnly = taskillo.access === 'read'

	// Subscribe to tasks and get CRUD operations
	const tasks = useTasks(taskillo.client, taskillo.fileId, taskillo.idTag)

	// Loading state - shown while connecting to RTDB
	if (taskillo.loading) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-vbox align-center p-2">
					<div className="c-spinner large" />
					<p className="mt-2">Connecting to Taskillo...</p>
				</Panel>
			</div>
		)
	}

	// Error state - shown if connection fails
	if (taskillo.error) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-alert error">
					<h3>Connection Error</h3>
					<p>{taskillo.error.message}</p>
				</Panel>
			</div>
		)
	}

	// Main UI - header, filter, input, and task list
	return (
		<div className="taskillo-app c-vbox w-100 h-100">
			<Header
				connected={taskillo.connected}
				totalCount={tasks.totalCount}
				activeCount={tasks.activeCount}
				completedCount={tasks.completedCount}
			/>

			<FilterBar filter={tasks.filter} onFilterChange={tasks.setFilter} />

			<TaskInput
				onCreateTask={tasks.createTask}
				disabled={!taskillo.connected || isReadOnly}
			/>

			<Panel className="task-list-container">
				<TaskList
					tasks={tasks.tasks}
					loading={tasks.loading}
					onToggleTask={tasks.toggleTask}
					onUpdateTask={tasks.updateTask}
					onDeleteTask={tasks.deleteTask}
					readOnly={isReadOnly}
				/>
			</Panel>
		</div>
	)
}

// vim: ts=4
