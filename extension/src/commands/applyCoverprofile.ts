/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';
import { applyCodeCoverageToAllEditors } from '../goCover';
import { getFromWorkspaceState, updateWorkspaceState } from '../stateUtils';
import { getWorkspaceFolderPath } from '../util';
import { fileExists } from '../utils/pathUtils';

export const applyCoverprofile: CommandFactory = () => {
	return () => {
		if (!vscode.window.activeTextEditor || !vscode.window.activeTextEditor.document.fileName.endsWith('.go')) {
			vscode.window.showErrorMessage('Cannot apply coverage profile when no Go file is open.');
			return;
		}
		const lastCoverProfilePathKey = 'lastCoverProfilePathKey';
		const lastCoverProfilePath = getFromWorkspaceState(lastCoverProfilePathKey, '');
		vscode.window
			.showInputBox({
				prompt: 'Enter the path to the coverage profile for current package',
				value: lastCoverProfilePath
			})
			.then((coverProfilePath) => {
				if (!coverProfilePath) {
					return;
				}
				if (!fileExists(coverProfilePath)) {
					vscode.window.showErrorMessage(`Cannot find the file ${coverProfilePath}`);
					return;
				}
				if (coverProfilePath !== lastCoverProfilePath) {
					updateWorkspaceState(lastCoverProfilePathKey, coverProfilePath);
				}
				applyCodeCoverageToAllEditors(
					coverProfilePath,
					getWorkspaceFolderPath(vscode.window.activeTextEditor?.document.uri)
				);
			});
	};
};
