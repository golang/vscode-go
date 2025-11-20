/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import { AttachItem, ProcessListCommand } from '../pickProcess';

// lsofDarwinCommand uses the lsof command to find the executable path.
// Argument explanation:
// - '-Pnl' disables the conversion of network numbers (n), user id numbers (l),
//   and port number (P) to potentially make the command run faster.
// - '-F ptnc' specifies the output to be printed for use in another program
//   and to include the pid (p), file descriptor and type (t), and name (n).
// - '-d txt' limits the files to be included to be those with file descriptor='txt'.
export const lsofDarwinCommand: ProcessListCommand = {
	command: 'lsof',
	args: ['-Pnl', '-F', 'pn', '-d', 'txt']
};

export function parseLsofProcesses(processes: string): AttachItem[] {
	const lines: string[] = processes.split('\n');
	return parseProcessesFromLsofArray(lines);
}

function parseProcessesFromLsofArray(processArray: string[], includesEnv?: boolean): AttachItem[] {
	const processEntries: AttachItem[] = [];
	let i = 0;
	while (i < processArray.length) {
		const line = processArray[i];
		i++;
		if (!line) {
			continue;
		}
		// The output for each process begins with a line containing the pid.
		const out = line[0];
		const val = line.substring(1);
		if (out !== 'p') {
			continue;
		}
		const processEntry: AttachItem = { id: val, label: '' };

		// Loop through every file which will have 3 lines containing: f=filedescriptor, t=type, n=name.
		while (i < processArray.length && processArray[i].length > 0 && processArray[i][0] !== 'p') {
			// Assume the first file with type 'txt' is the executable
			if (!processEntry.executable) {
				const file: {
					fd?: string;
					name?: string;
				} = parseFile(i, processArray);
				processEntry.executable = file.name;
			}
			i += 2;
		}

		if (processEntry) {
			processEntries.push(processEntry);
		}
	}
	return processEntries;
}

function parseFile(start: number, lines: string[]): { fd?: string; name?: string } {
	const file: {
		fd?: string;
		name?: string;
	} = {};

	for (let j = start; j < start + 2; j++) {
		const line = lines[j];
		if (!line) {
			continue;
		}
		const out = line[0];
		const val = line.substring(1);
		switch (out) {
			case 'f':
				file.fd = val;
				break;
			case 'n':
				file.name = val;
				break;
		}
	}
	return file;
}
