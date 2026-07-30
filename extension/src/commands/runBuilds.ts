/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { check } from '../diagnostics/goCheck';
import { CommandFactory } from '.';
import { handleErrors } from '../diagnostics/diagnostics';

export const runBuilds: CommandFactory =
	(ctx, goCtx) => (document: vscode.TextDocument, goConfig: vscode.WorkspaceConfiguration) => {
		if (document.languageId !== 'go') {
			return;
		}

		const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection } = goCtx;
		buildDiagnosticCollection?.clear();
		lintDiagnosticCollection?.clear();
		vetDiagnosticCollection?.clear();
		check(goCtx, document.uri, goConfig)
			.then((results) => {
				for (const result of results) {
					handleErrors(goCtx, document, result.errors, result.diagnosticCollection);
				}
			})
			.catch((err) => {
				vscode.window.showInformationMessage('Error: ' + err);
			});
	};
