/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');

interface Filter extends vscode.DocumentFilter {
	language: string;
	scheme: string;
}

export const GO_MODE: Filter = { language: 'go', scheme: 'file' };
export const GO_MOD_MODE: Filter = { language: 'go.mod', scheme: 'file' };
export const GO_SUM_MODE: Filter = { language: 'go.sum', scheme: 'file' };

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
