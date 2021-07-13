/* eslint-disable node/no-extraneous-import */
/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import { dirname } from 'path';
import { toolExecutionEnvironment } from './goEnv';
import { promptForMissingTool } from './goInstallTools';
import { getBinPath } from './util';
import * as lodash from 'lodash';
import vscode = require('vscode');

class InterfaceItem implements vscode.QuickPickItem {
	public label: string;
	public name: string;
	public package: string;
	public location: vscode.Location;

	constructor(public symbol: vscode.SymbolInformation) {
		this.label = symbol.name + ' ' + symbol.containerName;
		this.name = symbol.name;
		this.package = symbol.containerName;
		this.location = symbol.location;
	}
}

export function implCursor() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found.');
		return;
	}
	const cursor = editor.selection;
	const quickPick = vscode.window.createQuickPick();
	quickPick.placeholder = 'Input interface name (e.g. client)';

	const search = function (keyword: string) {
		console.debug('got: ', keyword);
		quickPick.busy = true;
		vscode.commands
			.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', keyword)
			.then((symbols) => {
				if (symbols === undefined) {
					return;
				}

				quickPick.items = symbols
					.filter((symbol) => symbol.kind === vscode.SymbolKind.Interface)
					.map((symbol) => {
						return new InterfaceItem(symbol);
					});
			});

		quickPick.busy = false;
	};

	quickPick.onDidChangeValue(lodash.debounce(search, 250));

	quickPick.onDidChangeSelection((selections: vscode.QuickPickItem[]) => {
		if (typeof selections === 'undefined') {
			return;
		}
		console.debug('onDidChangeSelection ', selections);
		const item = selections[0];
		if (item instanceof InterfaceItem) {
			console.debug(item);
			runGoImpl(['ReceiverName__ *Receiver__', item.package + '.' + item.name], cursor.start, editor);
		}
	});

	quickPick.show();

	return;
}

function runGoImpl(args: string[], insertPos: vscode.Position, editor: vscode.TextEditor) {
	const goimpl = getBinPath('impl');
	const p = cp.execFile(
		goimpl,
		args,
		{ env: toolExecutionEnvironment(), cwd: dirname(editor.document.fileName) },
		(err, stdout, stderr) => {
			if (err && (<any>err).code === 'ENOENT') {
				promptForMissingTool('impl');
				return;
			}

			if (err) {
				vscode.window.showInformationMessage(`Cannot stub interface: ${stderr}`);
				return;
			}

			// replace ReceiverName_ and Receiver__ with placeholders
			let stub = '\n' + stdout + '\n';
			stub = stub.replace('(ReceiverName__ *Receiver__)', '($0 *$1)');
			stub = stub.replace(new RegExp('ReceiverName__', 'g'), '${0:r}');
			stub = stub.replace(new RegExp('Receiver__', 'g'), '${1:receiver}');

			const snippet = new vscode.SnippetString(stub);
			editor.insertSnippet(snippet, insertPos);
		}
	);
	if (p.pid) {
		p.stdin.end();
	}
}
