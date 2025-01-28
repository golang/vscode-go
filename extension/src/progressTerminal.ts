/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import vscode = require('vscode');

import { ProgressToken } from 'vscode-languageclient';

// ActiveProgressTerminals maps progress tokens to their corresponding terminals.
// Entries are added when terminals are created for workdone progress and
// deleted when closed by the user, which is interpreted as the user discarding
// any further information.
// There is no guarantee a terminal will remain available for the entire
// duration of a workdone progress notification.
// Logs can be appended to the terminal even after the workdone progress
// notification finishes, allowing responses from requests extending
// WorkDoneProgressOptions to be displayed in the same terminal.
export const ActiveProgressTerminals = new Map<ProgressToken, IProgressTerminal>();

export interface IProgressTerminal {
	appendLine: (str: string) => void;
	show: (preserveFocus?: boolean) => void;
	exit: () => void;
}
export class ProgressTerminal implements IProgressTerminal {
	private progressToken?: ProgressToken;
	private term: vscode.Terminal;
	private writeEmitter = new vscode.EventEmitter<string>();

	// Buffer messages emitted before vscode is ready.  VSC calls pty.open when it is ready.
	private ptyReady = false;
	private buf: string[] = [];

	// Constructor function to stub during test.
	static Open(name = 'progress', token?: ProgressToken): IProgressTerminal {
		return new ProgressTerminal(name, token);
	}

	// ProgressTerminal created with token will be managed by map
	// ActiveProgressTerminals.
	private constructor(name: string, token?: ProgressToken) {
		const pty: vscode.Pseudoterminal = {
			onDidWrite: this.writeEmitter.event,
			handleInput: () => this.exit(),
			open: () => {
				this.ptyReady = true;
				this.buf.forEach((l) => this.writeEmitter.fire(l));
				this.buf = [];
			},
			close: () => {
				if (this.progressToken !== undefined) {
					ActiveProgressTerminals.delete(this.progressToken);
				}
			}
		};
		this.term = vscode.window.createTerminal({ name: name, pty }); // TODO: iconPath
		if (token !== undefined) {
			this.progressToken = token;
			ActiveProgressTerminals.set(this.progressToken, this);
		}
	}

	appendLine(str: string) {
		if (!str.endsWith('\n')) {
			str += '\n';
		}
		str = str.replace(/\n/g, '\n\r'); // replaceAll('\n', '\n\r').
		if (!this.ptyReady) {
			this.buf.push(str); // print when `open` is called.
		} else {
			this.writeEmitter.fire(str);
		}
	}

	show(preserveFocus?: boolean) {
		this.term.show(preserveFocus);
	}

	exit() {}
}
