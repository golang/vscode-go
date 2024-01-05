/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-async-promise-executor */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import { QuickPickItem } from 'vscode';
import { getBinPath } from './util';
import { lsofDarwinCommand, parseLsofProcesses } from './utils/lsofProcessParser';
import { getEnvPath, getCurrentGoRoot } from './utils/pathUtils';
import { parsePsProcesses, psDarwinCommand, psLinuxCommand } from './utils/psProcessParser';
import { parseWmicProcesses, wmicCommand } from './utils/wmicProcessParser';
import vscode = require('vscode');

export async function pickProcess(): Promise<string> {
	const allProcesses = await getAllProcesses();
	const id = await processPicker(allProcesses);
	return id;
}

export async function pickProcessByName(name: string): Promise<string> {
	const allProcesses = await getAllProcesses();
	const matches = allProcesses.filter((item) => item.processName === name);
	if (matches.length === 1) {
		return matches[0].id;
	}
	const id = await processPicker(allProcesses, name);
	return id;
}

export async function pickGoProcess(): Promise<string> {
	const allProcesses = await getGoProcesses();
	const id = await processPicker(allProcesses);
	return id;
}

async function processPicker(processes: AttachItem[], name?: string): Promise<string> {
	// We need to use createQuickPick instead of showQuickPick
	// to set the starting value for the menu.
	const menu = vscode.window.createQuickPick<AttachItem>();
	if (name) {
		menu.value = name;
	}
	menu.items = processes;
	menu.placeholder = 'Choose a process to attach to';
	menu.matchOnDescription = true;
	menu.matchOnDetail = true;
	return new Promise<string>(async (resolve, reject) => {
		menu.onDidAccept(() => {
			if (menu.selectedItems.length !== 1) {
				reject(new Error('No process selected.'));
			}
			const selectedId = menu.selectedItems[0].id;
			resolve(selectedId);
		});
		// The quickpick menu can be hidden either explicitly or
		// through other UI interactions. When the quick pick menu is
		// missing we want to keep the debugging setup process from
		// hanging, so we reject the selection.
		menu.onDidHide(() => {
			reject(new Error('No process selected.'));
		});

		menu.show();
	}).finally(() => menu.dispose());
}

// Modified from:
// https://github.com/microsoft/vscode-python/blob/main/src/client/debugger/extension/attachQuickPick/provider.ts
// - This extension adds a function for identifying the Go processes (getGoProcesses)
export interface AttachItem extends QuickPickItem {
	id: string;
	processName?: string;
	commandLine?: string;
	isGo?: boolean;
	executable?: string;
}

export interface ProcessListCommand {
	command: string;
	args: string[];
}

async function getGoProcesses(): Promise<AttachItem[]> {
	const processes = await getAllProcesses();
	if (process.platform === 'darwin') {
		// The executable paths are not set for darwin.
		// It appears there is no standard way to get the executable
		// path for a running process on darwin os. This implementation
		// may not work for all processes.
		const lsofOutput = await runCommand(lsofDarwinCommand);
		if (lsofOutput.err) {
			// We weren't able to run lsof, return all processes found.
			return processes;
		}
		const darwinExes = parseLsofProcesses(lsofOutput.stdout);
		// Merge the executable path to the processes obtained using ps.
		mergeExecutableAttachItem(processes, darwinExes);
	}

	// Run 'go version' on all executable paths to find 'go' processes
	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "go version" as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${getEnvPath()})`
		);
		return processes;
	}
	const args = ['version'];
	processes.forEach((item) => {
		if (item.executable) {
			args.push(item.executable);
		}
	});

	const { stdout } = await runCommand({ command: goRuntimePath, args });

	// Parse the executable paths from stdout. Ignore stderr, since we expect many to fail.
	const goProcessExecutables: string[] = parseGoVersionOutput(stdout);

	const goProcesses: AttachItem[] = [];
	processes.forEach((item) => {
		if (item.executable && goProcessExecutables.indexOf(item.executable) >= 0) {
			item.isGo = true;
			goProcesses.push(item);
		}
	});

	return goProcesses;
}

export function parseGoVersionOutput(stdout: string): string[] {
	const goProcessExes: string[] = [];
	const goVersionRegexp = /: go\d+\.\d+(\.\d+)?$/;

	const lines = stdout.toString().split('\n');
	lines.forEach((line) => {
		const match = line.match(goVersionRegexp);
		if (match && match.length > 0) {
			const exe = line.substr(0, line.length - match[0].length);
			goProcessExes.push(exe);
		}
	});
	return goProcessExes;
}

export const compareByProcessId = (a: AttachItem, b: AttachItem) => {
	return parseInt(a.id, 10) - parseInt(b.id, 10);
};

export function mergeExecutableAttachItem(processes: AttachItem[], addlAttachItemInfo: AttachItem[]) {
	processes.sort(compareByProcessId);
	addlAttachItemInfo.sort(compareByProcessId);
	let aIdx = 0;
	let pIdx = 0;
	while (aIdx < addlAttachItemInfo.length && pIdx < processes.length) {
		const aAttachItem = addlAttachItemInfo[aIdx];
		const pAttachItem = processes[pIdx];
		if (aAttachItem.id === pAttachItem.id) {
			pAttachItem.executable = aAttachItem.executable;
			aIdx++;
			pIdx++;
			continue;
		}

		if (compareByProcessId(pAttachItem, aAttachItem) > 0) {
			aIdx++;
		} else {
			pIdx++;
		}
	}
}

async function getAllProcesses(): Promise<AttachItem[]> {
	let processCmd: ProcessListCommand;
	switch (process.platform) {
		case 'win32':
			processCmd = wmicCommand;
			break;
		case 'darwin':
			processCmd = psDarwinCommand;
			break;
		case 'linux':
			processCmd = psLinuxCommand;
			break;
		default:
			// Other operating systems are not supported.
			throw new Error(
				`'pickProcess' and 'pickGoProcess' are not supported for ${process.platform}. Set process id in launch.json instead.`
			);
	}

	const { stdout } = await runCommand(processCmd);

	return process.platform === 'win32' ? parseWmicProcesses(stdout) : parsePsProcesses(stdout);
}

async function runCommand(
	processCmd: ProcessListCommand
): Promise<{ err: cp.ExecException | null; stdout: string; stderr: string }> {
	return await new Promise<{ err: cp.ExecException | null; stdout: string; stderr: string }>((resolve) => {
		cp.execFile(processCmd.command, processCmd.args, (err, stdout, stderr) => {
			resolve({ err, stdout, stderr });
		});
	});
}
