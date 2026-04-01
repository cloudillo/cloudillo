// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export class MockWebSocket {
	url: string
	readyState: number = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null

	sentMessages: unknown[] = []

	constructor(url: string) {
		this.url = url
	}

	send(data: string): void {
		this.sentMessages.push(JSON.parse(data))
	}

	close(): void {
		this.readyState = 3
		if (this.onclose) {
			this.onclose(new CloseEvent('close'))
		}
	}

	// Test utilities
	simulateOpen(): void {
		this.readyState = 1
		if (this.onopen) {
			this.onopen(new Event('open'))
		}
	}

	simulateMessage(data: unknown): void {
		if (this.onmessage) {
			this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
		}
	}

	simulateError(): void {
		if (this.onerror) {
			this.onerror(new Event('error'))
		}
	}

	simulateClose(): void {
		this.readyState = 3
		if (this.onclose) {
			this.onclose(new CloseEvent('close'))
		}
	}

	getLastSentMessage(): unknown {
		return this.sentMessages[this.sentMessages.length - 1]
	}

	getSentMessages(): unknown[] {
		return [...this.sentMessages]
	}

	clearSentMessages(): void {
		this.sentMessages = []
	}
}

// vim: ts=4
