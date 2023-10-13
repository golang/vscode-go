/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
'use strict';
import vscode = require('vscode');
import { GoDocumentFormattingEditProvider } from './legacy/goFormat';
import { GO_MODE } from '../goMode';

export class LegacyLanguageService implements vscode.Disposable {
	private _disposables: vscode.Disposable[] = [];

	constructor() {
		this._disposables.push(
			vscode.languages.registerDocumentFormattingEditProvider(GO_MODE, new GoDocumentFormattingEditProvider())
		);
	}

	dispose() {
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}
