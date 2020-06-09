/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import { EventEmitter } from 'events';
import stream = require('stream');

import { DebugProtocol } from 'vscode-debugprotocol';

// DapClient implements a simple client for the DAP protocol.
// It's initialized with a pair of streams that the caller creats and enables
// sending and receiving DAP messages over these streams.
// After calling connect():
//
//  - For sending messages call send().
//  - For receiving messages, subscibe to events this class emits.
//      - 'event', 'respones', 'request' - each carrying an appropriate
//        DebugProtocol type as an argument.
export class DapClient extends EventEmitter {
	private static readonly TWO_CRLF = '\r\n\r\n';

	private outputStream: stream.Writable;

	private rawData = Buffer.alloc(0);
	private contentLength: number = -1;

	constructor() {
		super();
	}

	protected connect(readable: stream.Readable, writable: stream.Writable): void {
		this.outputStream = writable;

		readable.on('data', (data: Buffer) => {
			this.handleData(data);
		});
	}

	public send(req: any): void {
		const json = JSON.stringify(req);
		this.outputStream.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`, 'utf8');
	}

	// Implements parsing of the DAP protocol. We cannot use ProtocolClient
	// from the vscode-debugadapter package, because it's not exported and
	// is not meant for external usage.
	// See https://github.com/microsoft/vscode-debugadapter-node/issues/232
	private handleData(data: Buffer): void {
		this.rawData = Buffer.concat([this.rawData, data]);

		while (true) {
			if (this.contentLength >= 0) {
				if (this.rawData.length >= this.contentLength) {
					const message = this.rawData.toString('utf8', 0, this.contentLength);
					this.rawData = this.rawData.slice(this.contentLength);
					this.contentLength = -1;
					if (message.length > 0) {
						this.dispatch(message);
					}
					continue;	// there may be more complete messages to process
				}
			} else {
				const idx = this.rawData.indexOf(DapClient.TWO_CRLF);
				if (idx !== -1) {
					const header = this.rawData.toString('utf8', 0, idx);
					const lines = header.split('\r\n');
					for (let i = 0; i < lines.length; i++) {
						const pair = lines[i].split(/: +/);
						if (pair[0] === 'Content-Length') {
							this.contentLength = +pair[1];
						}
					}
					this.rawData = this.rawData.slice(idx + DapClient.TWO_CRLF.length);
					continue;
				}
			}
			break;
		}
	}

	private dispatch(body: string): void {
		const rawData = JSON.parse(body);

		if (rawData.type == 'event') {
			const event = <DebugProtocol.Event>rawData;
			this.emit('event', event);
		} else if (rawData.type == 'response') {
			const response = <DebugProtocol.Response>rawData;
			this.emit('response', response);
		} else if (rawData.type == 'request') {
			const request = <DebugProtocol.Request>rawData;
			this.emit('request', request);
		} else {
			throw new Error(`unknown message ${JSON.stringify(rawData)}`);
		}
	}
}
