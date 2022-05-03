/* eslint-disable no-case-declarations */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import vscodeUri = require('vscode-uri');
import { getGoConfig } from './config';
import { formatGoVersion, GoEnvironmentOption, terminalCreationListener } from './goEnvironmentStatus';
import { buildLanguageServerConfig, getLocalGoplsVersion } from './language/goLanguageServer';
import { isGoFile } from './goMode';
import { isModSupported, runGoEnv } from './goModules';
import { allToolsInformation } from './goToolsInformation';
import { getGoVersion } from './util';
import { GoExtensionContext } from './context';

export const outputChannel = vscode.window.createOutputChannel('Go');

const STATUS_BAR_ITEM_NAME = 'Go Diagnostics';
export const diagnosticsStatusBarItem = vscode.window.createStatusBarItem(
	STATUS_BAR_ITEM_NAME,
	vscode.StatusBarAlignment.Left
);
diagnosticsStatusBarItem.name = STATUS_BAR_ITEM_NAME;

// statusbar item for switching the Go environment
export let goEnvStatusbarItem: vscode.StatusBarItem;

let gomod: string;
let gowork: string;
export const languageServerIcon = '$(zap)';
export const languageServerErrorIcon = '$(warning)';

export async function updateGoStatusBar(editor: vscode.TextEditor | undefined) {
	// Only update the module path if we are in a Go file.
	// This allows the user to open output windows without losing
	// the go.mod information in the status bar.
	if (!!editor && isGoFile(editor.document)) {
		const isMod = await isModSupported(editor.document.uri);
		if (isMod) {
			runGoEnv(vscodeUri.Utils.dirname(editor.document.uri), ['GOMOD', 'GOWORK']).then((p) => {
				gomod = p['GOMOD'] === '/dev/null' || p['GOMOD'] === 'NUL' ? '' : p['GOMOD'];
				gowork = p['GOWORK'];
			});
		} else {
			gomod = '';
			gowork = '';
		}
	}
}

export async function expandGoStatusBar(goCtx: GoExtensionContext) {
	const { languageServerIsRunning, serverOutputChannel } = goCtx;
	const options = [
		{ label: 'Locate Configured Go Tools', description: 'display go env' },
		{ label: 'Choose Go Environment' }
	];

	// Get the gopls configuration
	const goConfig = getGoConfig();
	const cfg = buildLanguageServerConfig(goConfig);
	if (languageServerIsRunning && cfg.serverName === 'gopls') {
		const goplsVersion = await getLocalGoplsVersion(cfg);
		options.push({ label: `${languageServerIcon}Open 'gopls' trace`, description: `${goplsVersion?.version}` });
	}
	if (!languageServerIsRunning && !cfg.serverName && goConfig['useLanguageServer'] === true) {
		options.push({
			label: 'Install Go Language Server',
			description: `${languageServerErrorIcon}'gopls' is required but missing`
		});
	}

	// If modules is enabled, add link to mod file
	if (gomod) {
		options.push({ label: "Open 'go.mod'", description: gomod });
	}

	if (gowork) {
		options.push({ label: "Open 'go.work'", description: gowork });
	}

	vscode.window.showQuickPick(options).then((item) => {
		if (item) {
			switch (item.label) {
				case 'Locate Configured Go Tools':
					vscode.commands.executeCommand('go.locate.tools');
					break;
				case 'Choose Go Environment':
					vscode.commands.executeCommand('go.environment.choose');
					break;
				case `${languageServerIcon}Open 'gopls' trace`:
					if (serverOutputChannel) {
						serverOutputChannel.show();
					}
					break;
				case 'Install Go Language Server':
					vscode.commands.executeCommand('go.tools.install', [allToolsInformation['gopls']]);
					break;
				case "Open 'go.work'":
				case "Open 'go.mod'":
					if (item.description) {
						const openPath = vscode.Uri.file(item.description);
						vscode.workspace.openTextDocument(openPath).then((doc) => {
							vscode.window.showTextDocument(doc);
						});
						break;
					}
			}
		}
	});
}

/**
 * Initialize the status bar item with current Go binary
 */
export async function initGoStatusBar(goCtx: GoExtensionContext) {
	const { languageServerIsRunning } = goCtx;
	if (!goEnvStatusbarItem) {
		const STATUS_BAR_ITEM_NAME = 'Go';
		goEnvStatusbarItem = vscode.window.createStatusBarItem(
			STATUS_BAR_ITEM_NAME,
			vscode.StatusBarAlignment.Left,
			50
		);
		goEnvStatusbarItem.name = STATUS_BAR_ITEM_NAME;
	}
	// set Go version and command
	const version = await getGoVersion();
	const goOption = new GoEnvironmentOption(version.binaryPath, formatGoVersion(version));

	goEnvStatusbarItem.text = goOption.label;
	goEnvStatusbarItem.command = 'go.environment.status';

	// Add an icon to indicate that the 'gopls' server is running.
	// Assume if it is configured it is already running, since the
	// icon will be updated on an attempt to start.
	const goConfig = getGoConfig();
	updateLanguageServerIconGoStatusBar(!!languageServerIsRunning, goConfig['useLanguageServer'] === true);

	showGoStatusBar();
}

export function updateLanguageServerIconGoStatusBar(started: boolean, enabled: boolean) {
	if (!goEnvStatusbarItem) {
		return;
	}

	// Split the existing goEnvStatusbarItem.text into the version string part and
	// the gopls icon part.
	let text = goEnvStatusbarItem.text;
	let icon = '';
	if (text.endsWith(languageServerIcon)) {
		text = text.substring(0, text.length - languageServerIcon.length);
	} else if (text.endsWith(languageServerErrorIcon)) {
		text = text.substring(0, text.length - languageServerErrorIcon.length);
	}

	if (started && enabled) {
		icon = languageServerIcon;
	} else if (!started && enabled) {
		icon = languageServerErrorIcon;
	}

	goEnvStatusbarItem.text = text + icon;
}

/**
 * disable the Go status bar items
 */
export function disposeGoStatusBar() {
	if (goEnvStatusbarItem) {
		goEnvStatusbarItem.dispose();
	}
	if (terminalCreationListener) {
		terminalCreationListener.dispose();
	}
	for (const statusBarEntry of statusBarEntries) {
		if (statusBarEntry) {
			const [name, entry] = statusBarEntry;
			statusBarEntries.delete(name);
			entry.dispose();
		}
	}
}

/**
 * Show the Go statusbar items on the statusbar
 */
export function showGoStatusBar() {
	if (goEnvStatusbarItem) {
		goEnvStatusbarItem.show();
	}
}

// status bar item to show warning messages such as missing analysis tools.
const statusBarEntries = new Map<string, vscode.StatusBarItem>();

export function removeGoStatus(name: string) {
	const statusBarEntry = statusBarEntries.get(name);
	if (statusBarEntry) {
		statusBarEntry.dispose();
		statusBarEntries.delete(name);
	}
}

export function addGoStatus(name: string, message: string, command: string, tooltip?: string) {
	let statusBarEntry = statusBarEntries.get(name);
	if (!statusBarEntry) {
		statusBarEntry = vscode.window.createStatusBarItem(name, vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
		statusBarEntries.set(name, statusBarEntry);

		statusBarEntry.name = name;
	}
	statusBarEntry.text = `$(alert) ${message}`;
	statusBarEntry.command = command;
	statusBarEntry.tooltip = tooltip;
	statusBarEntry.show();
}
