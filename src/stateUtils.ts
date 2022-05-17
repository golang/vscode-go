/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import { CommandFactory } from './commands';

let globalState: vscode.Memento;
let workspaceState: vscode.Memento;

export function getFromGlobalState(key: string, defaultValue?: any): any {
	if (!globalState) {
		return defaultValue;
	}
	return globalState.get(key, defaultValue);
}

export function updateGlobalState(key: string, value: any) {
	if (!globalState) {
		return Promise.resolve();
	}
	return globalState.update(key, value);
}

export function setGlobalState(state: vscode.Memento) {
	globalState = state;
}

export function getGlobalState() {
	return globalState;
}

export const resetGlobalState: CommandFactory = () => () => {
	resetStateQuickPick(globalState, updateGlobalState);
};

export function getFromWorkspaceState(key: string, defaultValue?: any) {
	if (!workspaceState) {
		return defaultValue;
	}
	return workspaceState.get(key, defaultValue);
}

export function updateWorkspaceState(key: string, value: any) {
	if (!workspaceState) {
		return Promise.resolve();
	}
	return workspaceState.update(key, value);
}

export function setWorkspaceState(state: vscode.Memento) {
	workspaceState = state;
}

export function getWorkspaceState(): vscode.Memento {
	return workspaceState;
}

export const resetWorkspaceState: CommandFactory = () => () => {
	resetStateQuickPick(workspaceState, updateWorkspaceState);
};

export function getMementoKeys(state: vscode.Memento): string[] {
	if (!state) {
		return [];
	}
	// tslint:disable-next-line: no-empty
	if ((state as any)._value) {
		const keys = Object.keys((state as any)._value);
		// Filter out keys with undefined values, so they are not shown
		// in the quick pick menu.
		return keys.filter((key) => state.get(key) !== undefined);
	}
	return [];
}

async function resetStateQuickPick(state: vscode.Memento, updateFn: (key: string, value: any) => Thenable<void>) {
	const items = await vscode.window.showQuickPick(getMementoKeys(state), {
		canPickMany: true,
		placeHolder: 'Select the keys to reset.'
	});
	if (items) {
		resetItemsState(items, updateFn);
	}
}

export function resetItemsState(items: string[] | undefined, updateFn: (key: string, value: any) => Thenable<void>) {
	if (!items) {
		return;
	}
	items.forEach((item) => updateFn(item, undefined));
}
