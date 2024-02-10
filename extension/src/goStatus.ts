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
import { GoDocumentSelector, isGoFile } from './goMode';
import { runGoEnv } from './goModules';
import { allToolsInformation } from './goToolsInformation';
import { getGoVersion } from './util';
import { GoExtensionContext } from './context';
import { CommandFactory } from './commands';
import { LanguageClient, State } from 'vscode-languageclient/node';

export const outputChannel = vscode.window.createOutputChannel('Go', { log: true });

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
const languageServerIcon = '$(zap)';
const languageServerErrorIcon = '$(warning)';
const languageServerStartingIcon = '$(sync~spin)';

export async function updateGoStatusBar(editor: vscode.TextEditor | undefined) {
	if (!editor) {
		return;
	}
	if (isGoFile(editor.document)) {
		showGoStatusBar();
		return;
	}
	if (editor.document.languageId?.toLowerCase() !== 'log') {
		goEnvStatusbarItem.hide();
	}
}

export const expandGoStatusBar: CommandFactory = (ctx, goCtx) => async () => {
	// Only update the module path if we are in a Go file.
	// This allows the user to open output windows without losing
	// the go.mod information in the status bar.
	const editor = vscode.window.activeTextEditor;
	if (!!editor && isGoFile(editor.document)) {
		const cwd = vscodeUri.Utils.dirname(editor.document.uri);
		try {
			const p = await runGoEnv(cwd, ['GOMOD', 'GOWORK']);
			gomod = p['GOMOD'] === '/dev/null' || p['GOMOD'] === 'NUL' ? '' : p['GOMOD'];
			gowork = p['GOWORK'];
		} catch (e) {
			outputChannel.debug(`failed to run go env from ${cwd} - ${e}`);
		}
	}

	const { languageServerIsRunning, serverOutputChannel } = goCtx;
	const options = [
		{ label: 'Locate Configured Go Tools', description: 'display go env' },
		{ label: 'Choose Go Environment' }
	];

	const cfg = goCtx.latestConfig;
	// Get the gopls configuration.
	const goConfig = getGoConfig();
	const goplsIsRunning = languageServerIsRunning && cfg && cfg.serverName === 'gopls';
	if (goplsIsRunning) {
		const goplsVersion = cfg.version;
		options.push({ label: `${languageServerIcon} Open 'gopls' trace`, description: `${goplsVersion?.version}` });
	}
	// In case gopls still need to be installed, cfg.serverName will be empty.
	if (!goplsIsRunning && goConfig.get('useLanguageServer') === true && cfg?.serverName === '') {
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
};

/**
 * Initialize the status bar item with current Go binary
 */
export async function initGoStatusBar(goCtx: GoExtensionContext) {
	const { languageClient } = goCtx;
	if (!goEnvStatusbarItem) {
		const STATUS_BAR_ITEM_NAME = 'Go';
		goEnvStatusbarItem = vscode.window.createStatusBarItem(
			STATUS_BAR_ITEM_NAME,
			vscode.StatusBarAlignment.Right,
			100.09999 // place the item right after the language status item https://github.com/microsoft/vscode-python/issues/18040#issuecomment-992567670.
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
	updateLanguageServerIconGoStatusBar(languageClient, goConfig['useLanguageServer'] === true);
	if (vscode.window.visibleTextEditors.some((editor) => !!editor && isGoFile(editor.document))) {
		showGoStatusBar();
	}
}

export function updateLanguageServerIconGoStatusBar(languageClient: LanguageClient | undefined, enabled: boolean) {
	if (!goEnvStatusbarItem) {
		return;
	}

	// Split the existing goEnvStatusbarItem.text into the version string part and
	// the gopls icon part.
	let text = goEnvStatusbarItem.text;
	if (text.endsWith(languageServerIcon)) {
		text = text.substring(0, text.length - languageServerIcon.length);
	} else if (text.endsWith(languageServerErrorIcon)) {
		text = text.substring(0, text.length - languageServerErrorIcon.length);
	} else if (text.endsWith(languageServerStartingIcon)) {
		text = text.substring(0, text.length - languageServerStartingIcon.length);
	}
	let color = undefined;
	let icon = '';
	if (!enabled || !languageClient) {
		icon = '';
		color = new vscode.ThemeColor('statusBarItem.warningBackground');
	} else if (languageClient.state === State.Starting) {
		icon = languageServerStartingIcon;
		color = undefined;
	} else if (languageClient.state === State.Running) {
		icon = languageServerIcon;
		color = undefined;
	} else if (languageClient.state === State.Stopped) {
		icon = languageServerErrorIcon;
		color = new vscode.ThemeColor('statusBarItem.errorBackground');
	}

	goEnvStatusbarItem.text = text + icon;
	goEnvStatusbarItem.backgroundColor = color;
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
const statusBarEntries = new Map<string, vscode.LanguageStatusItem>();

export function removeGoStatus(name: string) {
	const statusBarEntry = statusBarEntries.get(name);
	if (statusBarEntry) {
		statusBarEntry.dispose();
		statusBarEntries.delete(name);
	}
}

export function addGoStatus(name: string): vscode.LanguageStatusItem {
	let statusBarEntry = statusBarEntries.get(name);
	if (!statusBarEntry) {
		statusBarEntry = vscode.languages.createLanguageStatusItem(name, GoDocumentSelector);
		statusBarEntries.set(name, statusBarEntry);
	}
	return statusBarEntry;
}
