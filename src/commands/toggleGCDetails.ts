/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';

export const toggleGCDetails: CommandFactory = (ctx, goCtx) => {
	return () => {
		if (!goCtx.languageServerIsRunning) {
			vscode.window.showErrorMessage(
				'"Go: Toggle gc details" command is available only when the language server is running'
			);
			return;
		}
		const doc = vscode.window.activeTextEditor?.document.uri.toString();
		if (!doc || !doc.endsWith('.go')) {
			vscode.window.showErrorMessage('"Go: Toggle gc details" command cannot run when no Go file is open.');
			return;
		}
		vscode.commands.executeCommand('gc_details', doc).then(undefined, (reason0) => {
			vscode.commands.executeCommand('gopls.gc_details', doc).then(undefined, (reason1) => {
				vscode.window.showErrorMessage(
					`"Go: Toggle gc details" command failed: gc_details:${reason0} gopls_gc_details:${reason1}`
				);
			});
		});
	};
};
