/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

import { updateGoVarsFromConfig } from './goInstallTools';
import { getCurrentGoRoot } from './goPath';
import { getGoVersion } from './util';

// statusbar item for switching the Go environment
let goEnvStatusbarItem: vscode.StatusBarItem;

/**
 * Initialize the status bar item with current Go binary
 */
export async function initGoStatusBar() {
	goEnvStatusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);

	// make goroot default to go.goroot and fallback on $PATH
	const goroot = await getActiveGoRoot();
	if (!goroot) {
		// TODO: prompt user to install Go
		vscode.window.showErrorMessage('No Go command could be found.');
	}

	// set Go version and command
	const version = await getGoVersion();
	goEnvStatusbarItem.text = formatGoVersion(version.format());
	goEnvStatusbarItem.command = 'go.environment.choose';

	showGoStatusBar();
}

/**
 * disable the Go environment status bar item
 */
export function disposeGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.dispose();
	}
}

/**
 * Show the Go Environment statusbar item on the statusbar
 */
export function showGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.show();
	}
}

/**
 * Hide the Go Environment statusbar item from the statusbar
 */
export function hideGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.hide();
	}
}

/**
 * Present a command palette menu to the user to select their go binary
 * TODO: remove temporary alert and implement correct functionality
 */
export function chooseGoEnvironment() {
	vscode.window.showInformationMessage(`Current GOROOT: ${getCurrentGoRoot()}`);
}

/**
 * return reference to the statusbar item
 */
export function getGoEnvironmentStatusbarItem(): vscode.StatusBarItem {
	return goEnvStatusbarItem;
}

export async function getActiveGoRoot(): Promise<string | undefined> {
	// look for current current go binary
	let goroot = getCurrentGoRoot();
	if (!goroot) {
		await updateGoVarsFromConfig();
		goroot = getCurrentGoRoot();
	}
	return goroot || undefined;
}

export function formatGoVersion(version: string): string {
	const versionWords = version.split(' ');
	if (versionWords[0] === 'devel') {
		// Go devel +hash
		return `Go ${versionWords[0]} ${versionWords[4]}`;
	} else if (versionWords.length > 0) {
		// some other version format
		return `Go ${version.substr(0, 8)}`;
	} else {
		// default semantic version format
		return `Go ${versionWords[0]}`;
	}
}
