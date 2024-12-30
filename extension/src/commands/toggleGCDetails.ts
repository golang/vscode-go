/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';

export const toggleGCDetails: CommandFactory = (ctx, goCtx) => {
	return async () => {
		if (!goCtx.languageServerIsRunning) {
			vscode.window.showErrorMessage(
				'"Go: Toggle compiler optimization details" command is available only when the language server is running'
			);
			return;
		}
		const doc = vscode.window.activeTextEditor?.document.uri.toString();
		if (!doc || !doc.endsWith('.go')) {
			vscode.window.showErrorMessage(
				'"Go: Toggle compiler optimization details" command cannot run when no Go file is open.'
			);
			return;
		}
		try {
			await vscode.commands.executeCommand('gopls.gc_details', doc);
		} catch (e) {
			vscode.window.showErrorMessage(`"Go: Toggle compiler optimization details" command failed: ${e}`);
		}
	};
};
