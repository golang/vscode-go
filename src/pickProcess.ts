/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import util = require('util');
import { QuickPickItem } from 'vscode';
import vscode = require('vscode');
import { parsePsProcesses, psDarwinCommand, psLinuxCommand } from './utils/psProcessParser';
import { parseWmicProcesses, wmicCommand } from './utils/wmicProcessParser';

// TODO(suzmue): create a command pickGoProcess to filter
// to processes that are using go.
export async function pickProcess(): Promise<string> {
	const selection = await vscode.window.showQuickPick(
		getAllProcesses(),
		{
			placeHolder: 'Choose a process to attach to',
			matchOnDescription: true,
			matchOnDetail: true,
		}
	);
	if (!selection) {
		return '0';
	}
	return selection.id;
}

// Taken from:
// https://github.com/microsoft/vscode-python/blob/main/src/client/debugger/extension/attachQuickPick/provider.ts

export interface AttachItem extends QuickPickItem {
	id: string;
	processName: string;
	commandLine: string;
	isGo?: boolean;
}

export interface ProcessListCommand {
	command: string;
	args: string[];
}

async function getAllProcesses(): Promise<AttachItem[]> {
	let processCmd: ProcessListCommand;
	switch (process.platform) {
		case 'win32':
			processCmd = psDarwinCommand;
			break;
		case 'darwin':
			processCmd = psLinuxCommand;
			break;
		case 'linux':
			processCmd = wmicCommand;
			break;
		default:
			// Other operating systems are not supported.
			return [];
	}

	const execFile = util.promisify(cp.execFile);
	const { stdout } = await execFile(processCmd.command, processCmd.args);

	return process.platform === 'win32'
		? parseWmicProcesses(stdout)
		: parsePsProcesses(stdout);
}
