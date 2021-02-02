/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// Modified from:
// https://github.com/microsoft/vscode-python/blob/main/src/client/debugger/extension/attachQuickPick/wmicProcessParser.ts.
// - Added arguments to get the ExecutablePath from wmic.

'use strict';

import { AttachItem, ProcessListCommand } from '../pickProcess';

const wmicNameTitle = 'Name';
const wmicCommandLineTitle = 'CommandLine';
const wmicPidTitle = 'ProcessId';
const wmicExecutableTitle = 'ExecutablePath';
const defaultEmptyEntry: AttachItem = {
	label: '',
	description: '',
	detail: '',
	id: '',
	processName: '',
	commandLine: ''
};

// Perf numbers on Win10:
// | # of processes | Time (ms) |
// |----------------+-----------|
// |			309 |	   413 |
// |			407 |	   463 |
// |			887 |	   746 |
// |		   1308 |	  1132 |
export const wmicCommand: ProcessListCommand = {
	command: 'wmic',
	args: ['process', 'get', 'Name,ProcessId,CommandLine,ExecutablePath', '/FORMAT:list']
};

export function parseWmicProcesses(processes: string): AttachItem[] {
	const lines: string[] = processes.split('\r\n');
	const processEntries: AttachItem[] = [];
	let entry = { ...defaultEmptyEntry };

	for (const line of lines) {
		if (!line.length) {
			continue;
		}

		parseLineFromWmic(line, entry);

		// Each entry of processes has ProcessId as the last line
		if (line.lastIndexOf(wmicPidTitle, 0) === 0) {
			processEntries.push(entry);
			entry = { ...defaultEmptyEntry };
		}
	}

	return processEntries;
}

function parseLineFromWmic(line: string, item: AttachItem): AttachItem {
	const splitter = line.indexOf('=');
	const currentItem = item;

	if (splitter > 0) {
		const key = line.slice(0, splitter).trim();
		let value = line.slice(splitter + 1).trim();

		if (key === wmicNameTitle) {
			currentItem.label = value;
			currentItem.processName = value;
		} else if (key === wmicPidTitle) {
			currentItem.description = value;
			currentItem.id = value;
		} else if (key === wmicCommandLineTitle) {
			const dosDevicePrefix = '\\??\\'; // DOS device prefix, see https://reverseengineering.stackexchange.com/a/15178
			if (value.lastIndexOf(dosDevicePrefix, 0) === 0) {
				value = value.slice(dosDevicePrefix.length);
			}

			currentItem.detail = value;
			currentItem.commandLine = value;
		} else if (key === wmicExecutableTitle) {
			currentItem.executable = value;
		}
	}

	return currentItem;
}
