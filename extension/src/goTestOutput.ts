/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This module must not import vscode, so that it can be unit tested.

import path = require('path');
import type { GoTestOutput } from './testUtils';
import { expandFilePathInOutput } from './utils/pathUtils';

/**
 * Returns a function that handles one line of `go test -json` output and
 * writes the text meant for the user to outputChannel.
 *
 * @param cwd The working directory of the `go test` process. File names in
 * build output are relative to it.
 */
export function processTestResultLineInJSONMode(
	pkgMap: Map<string, string>,
	currentGoWorkspace: string,
	outputChannel: { appendLine(value: string): void },
	cwd: string,
	goTestOutputConsumer?: (_: GoTestOutput) => void
) {
	return (line: string) => {
		try {
			const m = <GoTestOutput>JSON.parse(line);
			if (goTestOutputConsumer) {
				goTestOutputConsumer(m);
			}
			if (m.Action === 'build-output' && m.Output) {
				// Since go1.24, go test -json reports build errors as build-output
				// events instead of writing them to stderr (golang/vscode-go#3744).
				// Like the stderr output, they contain file names relative to the cwd.
				outputChannel.appendLine(expandFilePathInOutput(m.Output, cwd).trimRight());
				return;
			}
			if (m.Action !== 'output' || !m.Output) {
				return;
			}
			const out = m.Output;
			const pkg = m.Package;
			if (pkg && (pkgMap.has(pkg) || currentGoWorkspace)) {
				const pkgNameArr = pkg.split('/');
				const baseDir = pkgMap.get(pkg) || path.join(currentGoWorkspace, ...pkgNameArr);
				// go test emits test results on stdout, which contain file names relative to the package under test
				outputChannel.appendLine(expandFilePathInOutput(out, baseDir).trimRight());
			} else {
				outputChannel.appendLine(out.trimRight());
			}
		} catch (e) {
			// TODO: disable this log if it becomes too spammy.
			console.log(`failed to parse JSON: ${e}: ${line}`);
			// Build failures or other messages come in non-JSON format. So, output as they are.
			outputChannel.appendLine(line);
		}
	};
}
