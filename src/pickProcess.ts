/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import util = require('util');
import { QuickPickItem } from 'vscode';
import vscode = require('vscode');
import { toolExecutionEnvironment } from './goEnv';
import { getBinPath, getWorkspaceFolderPath } from './util';
import { envPath, getCurrentGoRoot } from './utils/pathUtils';
import { parsePsProcesses, psDarwinCommand, psLinuxCommand } from './utils/psProcessParser';
import { parseWmicProcesses, wmicCommand } from './utils/wmicProcessParser';

export async function pickProcess(): Promise<string> {
	const allProcesses = await getAllProcesses();
	const id = await processPicker(allProcesses);
	return id;
}

export async function pickGoProcess(): Promise<string> {
	const allProcesses = await getGoProcesses();
	const id = await processPicker(allProcesses);
	return id;
}

async function processPicker(processes: AttachItem[]): Promise<string> {
	const selection = await vscode.window.showQuickPick(
		processes,
		{
			placeHolder: 'Choose a process to attach to',
			matchOnDescription: true,
			matchOnDetail: true,
		}
	);
	if (!selection) {
		return Promise.reject(new Error('No process selected'));
	}
	return Promise.resolve(selection.id);
}

// Modified from:
// https://github.com/microsoft/vscode-python/blob/main/src/client/debugger/extension/attachQuickPick/provider.ts
// - This extension adds a function for identifying the Go processes (getGoProcesses)
export interface AttachItem extends QuickPickItem {
	id: string;
	processName: string;
	commandLine: string;
	executable?: string;
	isGo?: boolean;
}

export interface ProcessListCommand {
	command: string;
	args: string[];
}

async function getGoProcesses(): Promise<AttachItem[]> {
	const processes = await getAllProcesses();
	// TODO(suzmue): Set the executable path for darwin.
	if (process.platform === 'darwin') {
		return processes;
	}

	// Run 'go version' on all executable paths to find 'go' processes
	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "go version" as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath})`
		);
		return processes;
	}
	const args = ['version'];
	processes.forEach((item, i) => {
		args.push(item.executable);
	});
	const {stdout} = cp.spawnSync(goRuntimePath, args, { env: toolExecutionEnvironment(), cwd: getWorkspaceFolderPath() });

	// Parse the process ids from stdout. Ignore stderr, since we expect many to fail.
	const goProcessExes: string[] = [];
	const lines = stdout.toString().split('\n');

	const goVersionRegexp = /: go\d+.\d+.\d+$/;
	lines.forEach((line) => {
		const match = line.match(goVersionRegexp);
		if (match && match.length > 0) {
			const exe = line.substr(0, line.length - match[0].length);
			goProcessExes.push(exe);
		}
	});

	const goProcesses: AttachItem[] = [];
	processes.forEach((item) => {
		if (goProcessExes.indexOf(item.executable) >= 0) {
			item.isGo = true;
			goProcesses.push(item);
		}
	});
	return goProcesses;
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
			return [];
	}

	const execFile = util.promisify(cp.execFile);
	const { stdout } = await execFile(processCmd.command, processCmd.args);

	return process.platform === 'win32'
		? parseWmicProcesses(stdout)
		: parsePsProcesses(stdout);
}
