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

export function isGoFile(document: vscode.TextDocument): boolean {
	return GoDocumentSelector.some((selector) => vscode.languages.match(selector, document));
}

export const GoDocumentSelector = [
	// gopls handles only file URIs.
	{ language: 'go', scheme: 'file' },
	{ language: 'go.mod', scheme: 'file' },
	{ language: 'go.sum', scheme: 'file' },
	{ language: 'go.work', scheme: 'file' },
	{ language: 'gotmpl', scheme: 'file' }
];
