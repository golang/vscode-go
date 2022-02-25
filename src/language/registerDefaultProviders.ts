/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
'use strict';
import vscode = require('vscode');
import { GoCodeActionProvider } from './legacy/goCodeAction';
import { GoDefinitionProvider } from './legacy/goDeclaration';
import { GoHoverProvider } from './legacy/goExtraInfo';
import { GoDocumentFormattingEditProvider } from './legacy/goFormat';
import { GoImplementationProvider } from './legacy/goImplementations';
import { parseLiveFile } from './legacy/goLiveErrors';
import { GO_MODE } from '../goMode';
import { GoDocumentSymbolProvider } from './legacy/goOutline';
import { GoReferenceProvider } from './legacy/goReferences';
import { GoRenameProvider } from './legacy/goRename';
import { GoSignatureHelpProvider } from './legacy/goSignature';
import { GoCompletionItemProvider } from './legacy/goSuggest';
import { GoWorkspaceSymbolProvider } from './legacy/goSymbol';
import { GoTypeDefinitionProvider } from './legacy/goTypeDefinition';

export class LegacyLanguageService implements vscode.Disposable {
	private _disposables: vscode.Disposable[] = [];

	constructor(ctx: vscode.ExtensionContext) {
		const completionProvider = new GoCompletionItemProvider(ctx.globalState);
		this._disposables.push(completionProvider);
		this._disposables.push(vscode.languages.registerCompletionItemProvider(GO_MODE, completionProvider, '.', '"'));
		this._disposables.push(vscode.languages.registerHoverProvider(GO_MODE, new GoHoverProvider()));
		this._disposables.push(vscode.languages.registerDefinitionProvider(GO_MODE, new GoDefinitionProvider()));
		this._disposables.push(vscode.languages.registerReferenceProvider(GO_MODE, new GoReferenceProvider()));
		this._disposables.push(
			vscode.languages.registerDocumentSymbolProvider(GO_MODE, new GoDocumentSymbolProvider())
		);
		this._disposables.push(vscode.languages.registerWorkspaceSymbolProvider(new GoWorkspaceSymbolProvider()));
		this._disposables.push(
			vscode.languages.registerSignatureHelpProvider(GO_MODE, new GoSignatureHelpProvider(), '(', ',')
		);
		this._disposables.push(
			vscode.languages.registerImplementationProvider(GO_MODE, new GoImplementationProvider())
		);
		this._disposables.push(
			vscode.languages.registerDocumentFormattingEditProvider(GO_MODE, new GoDocumentFormattingEditProvider())
		);
		this._disposables.push(
			vscode.languages.registerTypeDefinitionProvider(GO_MODE, new GoTypeDefinitionProvider())
		);
		this._disposables.push(vscode.languages.registerRenameProvider(GO_MODE, new GoRenameProvider()));
		this._disposables.push(vscode.workspace.onDidChangeTextDocument(parseLiveFile, null, ctx.subscriptions));
		this._disposables.push(vscode.languages.registerCodeActionsProvider(GO_MODE, new GoCodeActionProvider()));
	}

	dispose() {
		for (const d of this._disposables) {
			d.dispose();
		}
	}
}
