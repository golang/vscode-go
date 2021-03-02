/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

export const GO_MODE: vscode.DocumentFilter = { language: 'go', scheme: 'file' };
export const GO_MOD_MODE: vscode.DocumentFilter = { language: 'go.mod', scheme: 'file' };
export const GO_SUM_MODE: vscode.DocumentFilter = { language: 'go.sum', scheme: 'file' };

export function isGoFile(document: vscode.TextDocument): boolean {
	if (
		vscode.languages.match(GO_MODE, document) ||
		vscode.languages.match(GO_MOD_MODE, document) ||
		vscode.languages.match(GO_SUM_MODE, document)
	) {
		return true;
	}
	return false;
}
