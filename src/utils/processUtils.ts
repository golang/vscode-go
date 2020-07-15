/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import kill = require('tree-kill');

// Kill a process and its children, returning a promise.
export function killProcessTree(
	p: ChildProcess,
	logger?: (...args: any[]) => void): Promise<void> {
	if (!logger) {
		logger = console.log;
	}
	if (!p || !p.pid) {
		logger(`no process to kill`);
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		kill(p.pid, (err) => {
			if (err) {
				logger(`Error killing process ${p.pid}: ${err}`);
			} else {
				logger(`killed process ${p.pid}`);
			}
			resolve();
		});
	});
}

// Kill a process.
//
// READ THIS BEFORE USING THE FUNCTION:
//
// TODO: This function is kept for historical reasons and should be removed once
// its user (go-outline) is replaced. Outlining uses this function and not
// killProcessTree because of performance issues that were observed in the past.
// See https://go-review.googlesource.com/c/vscode-go/+/242518/ for more
// details and background.
export function killProcess(p: ChildProcess) {
	if (p) {
		try {
			p.kill();
		} catch (e) {
			console.log('Error killing process: ' + e);
		}
	}
}