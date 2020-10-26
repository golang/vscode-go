/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import path = require('path');
import vscode = require('vscode');
import { formatGoVersion, GoEnvironmentOption, terminalCreationListener } from './goEnvironmentStatus';
import { buildLanguageServerConfig, getLocalGoplsVersion, serverOutputChannel } from './goLanguageServer';
import { isGoFile } from './goMode';
import { getModFolderPath, isModSupported } from './goModules';
import { getGoVersion } from './util';

export let outputChannel = vscode.window.createOutputChannel('Go');

export let diagnosticsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

// statusbar item for switching the Go environment
export let goEnvStatusbarItem: vscode.StatusBarItem;

let statusBarEntry: vscode.StatusBarItem;
let modulePath: string;
export const languageServerIcon = '$(zap)';

export function updateGoStatusBar(editor: vscode.TextEditor) {
	// Only update the module path if we are in a Go file.
	// This allows the user to open output windows without losing
	// the go.mod information in the status bar.
	if (!!editor && isGoFile(editor.document)) {
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

/**
 * Initialize the status bar item with current Go binary
 */
export async function initGoStatusBar() {
	if (!goEnvStatusbarItem) {
		goEnvStatusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	}
	// set Go version and command
	const version = await getGoVersion();
	const goOption = new GoEnvironmentOption(version.binaryPath, formatGoVersion(version));

	goEnvStatusbarItem.text = goOption.label;
	goEnvStatusbarItem.command = 'go.environment.status';

	// Add an icon to indicate that the 'gopls' server is running.
	// Assume if it is configured it is already running, since the
	// icon will be updated on an attempt to start.
	const cfg = buildLanguageServerConfig();
	updateLanguageServerIconGoStatusBar(true, cfg.serverName);

	showGoStatusBar();
}

export async function updateLanguageServerIconGoStatusBar(started: boolean, server: string) {
	if (!goEnvStatusbarItem) {
		return;
	}

	const text = goEnvStatusbarItem.text;
	if (started && server === 'gopls') {
		if (!text.endsWith(languageServerIcon)) {
			goEnvStatusbarItem.text = text + languageServerIcon;
		}
	} else {
		if (text.endsWith(languageServerIcon)) {
			goEnvStatusbarItem.text = text.substring(0, text.length - languageServerIcon.length);
		}
	}
}

/**
 * disable the Go status bar items
 */
export function disposeGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.dispose();
	}
	if (!!terminalCreationListener) {
		terminalCreationListener.dispose();
	}
	removeGoStatus();
}

/**
 * Show the Go statusbar items on the statusbar
 */
export function showGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.show();
	}
}

export function removeGoStatus() {
	if (statusBarEntry) {
		statusBarEntry.dispose();
	}
}

export function addGoStatus(message: string, command: string, tooltip?: string) {
	statusBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	statusBarEntry.text = `$(alert) ${message}`;
	statusBarEntry.command = command;
	statusBarEntry.tooltip = tooltip;
	statusBarEntry.show();
}
