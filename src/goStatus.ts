/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import path = require('path');
import vscode = require('vscode');
import { buildLanguageServerConfig, getLocalGoplsVersion, serverOutputChannel } from './goLanguageServer';
import { GO_MODE } from './goMode';
import { getModFolderPath, isModSupported } from './goModules';

export let outputChannel = vscode.window.createOutputChannel('Go');

export let diagnosticsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

let statusBarEntry: vscode.StatusBarItem;
let modulePath: string;
export const languageServerIcon = '$(zap)';

export function showHideStatus(editor: vscode.TextEditor) {
	if (statusBarEntry) {
		if (!editor) {
			statusBarEntry.hide();
		} else if (vscode.languages.match(GO_MODE, editor.document)) {
			statusBarEntry.show();
		} else {
			statusBarEntry.hide();
		}
	}

	if (editor) {
		isModSupported(editor.document.uri).then((isMod) => {
			if (isMod) {
				getModFolderPath(editor.document.uri).then((p) => modulePath = p);
			} else {
				modulePath = '';
			}
		});
	}
}

export async function expandGoStatusBar() {
	const options = [
		{label: `Locate Configured Go Tools`, description: 'display go env'},
		{label: `Choose Go Environment`}
	];

	// Get the gopls configuration
	const cfg = buildLanguageServerConfig();
	if (cfg.serverName === 'gopls') {
		const goplsVersion = await getLocalGoplsVersion(cfg);
		options.push({label: `${languageServerIcon}Open 'gopls' trace`, description: `${goplsVersion}`});
	}

	// If modules is enabled, add link to mod file
	if (!!modulePath) {
		options.push({label: `Open 'go.mod'`, description: path.join(modulePath, 'go.mod')});
	}

	vscode.window.showQuickPick(options).then((item) => {
		if (!!item) {
			switch (item.label) {
				case `Locate Configured Go Tools`:
					vscode.commands.executeCommand('go.locate.tools');
					break;
				case `Choose Go Environment`:
					vscode.commands.executeCommand('go.environment.choose');
					break;
				case `${languageServerIcon}Open 'gopls' trace`:
					if (!!serverOutputChannel) {
						serverOutputChannel.show();
					}
					break;
				case `Open 'go.mod'`:
					const openPath = vscode.Uri.file(item.description);
					vscode.workspace.openTextDocument(openPath).then((doc) => {
						vscode.window.showTextDocument(doc);
					});
					break;
			}
		}
	});

}

export function hideGoStatus() {
	if (statusBarEntry) {
		statusBarEntry.dispose();
	}
}

export function showGoStatus(message: string, command: string, tooltip?: string) {
	statusBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	statusBarEntry.text = `$(alert) ${message}`;
	statusBarEntry.command = command;
	statusBarEntry.tooltip = tooltip;
	statusBarEntry.show();
}
