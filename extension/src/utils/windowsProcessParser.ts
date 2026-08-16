/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import type * as Win32AppContainerTokens from '@vscode/win32-app-container-tokens';
import path = require('path');
import { AttachItem } from '../pickProcess';

export async function getWindowsProcesses(): Promise<AttachItem[]> {
	const win = await getWinUtils();
	return win.getProcessInfo().map(parseWindowsProcessInfo);
}

// Adapted from vscode-js-debug https://github.com/microsoft/vscode-js-debug/blob/a72801b175c1856138e30679624c97b3b062dc65/src/ui/processTree/windowsProcessTree.ts

/**
 * Parses a Windows ProcessInfo into an AttachItem for the process picker.
 *
 * Extracts the executable path from `proc.commandLine`:
 * - Quoted path (e.g. `"C:\Program Files\app.exe" --arg`): parses up to `'" '` and strips the leading quote.
 * - Unquoted path (e.g. `C:\app.exe --arg`): parses up to the first space `' '`.
 *
 * Example input: `{ processId: 1234, commandLine: '"C:\\Program Files\\Go\\bin\\go.exe" run main.go', ... }`
 * Output executable: `'C:\\Program Files\\Go\\bin\\go.exe'`
 */
export function parseWindowsProcessInfo(proc: Win32AppContainerTokens.ProcessInfo): AttachItem {
	let command: string;

	const quoteEnd = proc.commandLine.indexOf('" ');
	if (quoteEnd === -1) {
		const space = proc.commandLine.indexOf(' ');
		if (space === -1) {
			command = proc.commandLine;
		} else {
			command = proc.commandLine.slice(0, space);
		}
	} else {
		command = proc.commandLine.slice(1, quoteEnd);
	}

	const pidStr = proc.processId.toString();
	const processName = (path.win32 ? path.win32.basename(command) : path.basename(command)) || `Process ${pidStr}`;

	return {
		id: pidStr,
		label: processName,
		processName: processName,
		description: pidStr,
		detail: proc.commandLine,
		commandLine: proc.commandLine,
		executable: command
	};
}

// Adapted from vscode-js-debug https://github.com/microsoft/vscode-js-debug/blob/a72801b175c1856138e30679624c97b3b062dc65/src/common/win32Utils.ts

function once<T>(fn: () => Promise<T>): () => Promise<T> {
	let value: Promise<T> | undefined;
	return () => {
		if (!value) {
			value = fn();
		}
		return value;
	};
}

const load = once((): Promise<typeof Win32AppContainerTokens> => {
	return Promise.resolve(require('@vscode/win32-app-container-tokens'));
});

function getWinUtils(): Promise<typeof Win32AppContainerTokens> {
	if (process.platform !== 'win32') {
		throw new Error('Not running on Windows');
	}

	return load();
}
