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

export class MockWebSocket {
	url: string
	readyState: number = 0
	onopen: ((event: Event) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent) => void) | null = null

	sentMessages: any[] = []

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

	simulateMessage(data: any): void {
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

	getLastSentMessage(): any {
		return this.sentMessages[this.sentMessages.length - 1]
	}

	getSentMessages(): any[] {
		return [...this.sentMessages]
	}

	clearSentMessages(): void {
		this.sentMessages = []
	}
}

// vim: ts=4
