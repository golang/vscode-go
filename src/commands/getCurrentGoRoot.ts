/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';
import { getCurrentGoRoot as utilGetCurrentGoRoot } from '../utils/pathUtils';

export const getCurrentGoRoot: CommandFactory = () => {
	return () => {
		const goroot = utilGetCurrentGoRoot();
		const msg = `${goroot} is the current GOROOT.`;
		vscode.window.showInformationMessage(msg);
		return goroot;
	};
};
