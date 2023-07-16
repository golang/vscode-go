/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';
import { getGoConfig } from '../config';
import { getCurrentGoPath as utilGetCurrentGoPath, getWorkspaceFolderPath } from '../util';

export const getCurrentGoPath: CommandFactory = () => {
	return () => {
		const gopath = utilGetCurrentGoPath();
		let msg = `${gopath} is the current GOPATH.`;
		const wasInfered = getGoConfig()['inferGopath'];
		const root = getWorkspaceFolderPath(
			vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri
		);

		// not only if it was configured, but if it was successful.
		if (wasInfered && root && root.indexOf(gopath) === 0) {
			const inferredFrom = vscode.window.activeTextEditor ? 'current folder' : 'workspace root';
			msg += ` It is inferred from ${inferredFrom}`;
		}

		vscode.window.showInformationMessage(msg);
		return gopath;
	};
};
