/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import kill = require('tree-kill');

// Kill a process and its children, returning a promise.
export function killProcessTree(p: ChildProcess, logger: (...args: any[]) => void = console.log): Promise<void> {
	if (!p || !p.pid || p.exitCode !== null) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		kill(p.pid, (err) => {
			if (err) {
				logger(`Error killing process ${p.pid}: ${err}`);
			}
			resolve();
		});
	});
}
