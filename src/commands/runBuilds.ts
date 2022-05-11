/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection } from '../goMain';
import { check } from '../goCheck';
import { CommandFactory } from '.';
import { handleDiagnosticErrors } from '../util';

export const runBuilds: CommandFactory = () => (
	document: vscode.TextDocument,
	goConfig: vscode.WorkspaceConfiguration
) => {
	if (document.languageId !== 'go') {
		return;
	}

	buildDiagnosticCollection?.clear();
	lintDiagnosticCollection?.clear();
	vetDiagnosticCollection?.clear();
	check(document.uri, goConfig)
		.then((results) => {
			results.forEach((result) => {
				handleDiagnosticErrors(document, result.errors, result.diagnosticCollection);
			});
		})
		.catch((err) => {
			vscode.window.showInformationMessage('Error: ' + err);
		});
};
