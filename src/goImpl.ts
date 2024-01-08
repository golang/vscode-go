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
import vscode = require('vscode');
import { CommandFactory } from './commands';

// Accepts input of the form:
// [f *File] io.Closer [, ...]
// [f *File] io.Closer
// io.Closer (type name will be deduced from variable name from cursor position)
// io.Closer, io.Reader (same as above)
const inputRegex = /^(?<identifier>(?<variable>[\p{Letter}_][\p{Letter}_\p{Number}\d]*) *(?<type>[*]? *[\p{Letter}_][\p{Letter}_\p{Number}\d]*) +)?(?<interfaces>(?:[\p{Letter}_][\p{Letter}_\p{Number}\d\.\-\/]*)+(?: *, *(?:[\p{Letter}_][\p{Letter}_\p{Number}\d\.\-\/]*)+)*)$/u;

export const implCursor: CommandFactory = () => () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found.');
		return;
	}
	const cursor = editor.selection;
	return vscode.window
		.showInputBox({
			placeHolder: '[f *File] io.Closer [, ...]',
			prompt: 'Enter receiver and interface to implement.'
		})
		.then((implInput) => {
			if (typeof implInput === 'undefined') {
				return;
			}
			const matches = implInput.match(inputRegex);
			if (!matches || !matches.groups || !matches.groups.interfaces) {
				vscode.window.showInformationMessage(`Not parsable input: ${implInput}`);
				return;
			}

			let identifier = matches.groups?.identifier;
			if (!identifier) {
				const beforeCursor = new vscode.Range(new vscode.Position(cursor.start.line, 0), cursor.start);
				const beforeCursorText = editor.document.getText(beforeCursor);
				const typeIndex = beforeCursorText.lastIndexOf('type');
				if (typeIndex === -1) {
					vscode.window.showInformationMessage('No identifier found at cursor.');
					return;
				}

				const variable = editor.document.getText(cursor)[0].toLowerCase();
				identifier = editor.document.getText(cursor);
				identifier = `${variable} *${identifier}`;

				let newPosition = cursor.start.with(cursor.start.line + 1, 0);
				newPosition = newPosition.translate(1, 0);
				editor.selection = new vscode.Selection(newPosition, newPosition);
			}
			const interfaces = matches.groups?.interfaces.trim().split(',');
			interfaces.forEach((iface, i) => {
				interfaces[i] = iface.trim();
			});
			runGoImpl([identifier, interfaces], editor);
		});
};

function runGoImpl(prompt: [string, string[]], editor: vscode.TextEditor) {
	const goimpl = getBinPath('impl');
	prompt[1].forEach((iface) => {
		const p = cp.execFile(
			goimpl,
			[prompt[0], iface],
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

				(function (out: string) {
					editor.edit((editBuilder) => {
						editBuilder.insert(editor.selection.start, out);
					});
				})(stdout);
			}
		);
		if (p.pid) {
			p.stdin?.end();
		}
	});
}
