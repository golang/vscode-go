/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { check } from '../goCheck';
import { CommandFactory } from '.';
import { handleDiagnosticErrors } from '../util';

export const runBuilds: CommandFactory = (ctx, goCtx) => (
	document: vscode.TextDocument,
	goConfig: vscode.WorkspaceConfiguration
) => {
	if (document.languageId !== 'go') {
		return;
	}

	const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection } = goCtx;
	buildDiagnosticCollection?.clear();
	lintDiagnosticCollection?.clear();
	vetDiagnosticCollection?.clear();
	check(goCtx, document.uri, goConfig)
		.then((results) => {
			results.forEach((result) => {
				handleDiagnosticErrors(goCtx, document, result.errors, result.diagnosticCollection);
			});
		})
		.catch((err) => {
			vscode.window.showInformationMessage('Error: ' + err);
		});
};
