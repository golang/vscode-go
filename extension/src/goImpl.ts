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
import { GoExtensionContext } from './context';
import { interactiveResolveOptions } from './language/form';
import { TelemetryKey, telemetryReporter } from './goTelemetry';

export const GOPLS_IMPLEMENT_INTERFACE_COMMAND = 'gopls.implement_interface';

// Supports only passing interface, see TODO in implCursor to finish
// eslint-disable-next-line no-useless-escape
const inputRegex = /^(\w+\ \*?\w+\ )?([\w\.\-\/]+)$/;

// supportsImplementInterface checks if gopls supports interactive execution of
// the "implement_interface" command.
//
// Unlike other commands, checking command existence is insufficient because gopls
// v0.22.+ exposed the command before the interactive command resolution protocol
// was finalized in v0.23.0. Therefore, we check whether the language server
// advertises 'command' in its server capability.
function supportsImplementInterface(goCtx: GoExtensionContext): boolean {
	if (!goCtx.serverInfo?.Commands?.includes(GOPLS_IMPLEMENT_INTERFACE_COMMAND)) {
		return false;
	}
	const option = goCtx.languageClient?.initializeResult?.capabilities?.experimental?.interactiveResolveProvider as
		interactiveResolveOptions | undefined;
	if (!option || !Array.isArray(option.kinds) || !option.kinds.includes('command')) {
		return false;
	}
	return true;
}

// implCursor generates method stubs for implementing the provided interface
// based on the type defined at cursor.
//
// If the gopls support gopls.implement_interface command, the function calls
// gopls's command in favor of the "impl".
export const implCursor: CommandFactory = (_ctx, goCtx) => async (uri?: vscode.Uri) => {
	const useGoplsCommand = supportsImplementInterface(goCtx);
	if (useGoplsCommand) {
		telemetryReporter.add(
			uri
				? TelemetryKey.COMMAND_TRIGGER_GOPLS_IMPLEMENT_INTERFACE_CONTEXT_MENU
				: TelemetryKey.COMMAND_TRIGGER_GOPLS_IMPLEMENT_INTERFACE_COMMAND_PALETTE,
			1
		);
	} else {
		telemetryReporter.add(
			uri ? TelemetryKey.COMMAND_TRIGGER_IMPL_CONTEXT_MENU : TelemetryKey.COMMAND_TRIGGER_IMPL_COMMAND_PALETTE,
			1
		);
	}

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found.');
		return;
	}

	if (useGoplsCommand) {
		await vscode.commands.executeCommand(GOPLS_IMPLEMENT_INTERFACE_COMMAND, {
			location: {
				uri: editor.document.uri.toString(),
				range: editor.selection
			}
		});
		return;
	}

	const cursor = editor.selection;
	return vscode.window
		.showInputBox({
			placeHolder: 'f *File io.Closer',
			prompt: 'Enter receiver and interface to implement.'
		})
		.then((implInput) => {
			if (typeof implInput === 'undefined') {
				return;
			}
			const matches = implInput.match(inputRegex);
			if (!matches) {
				vscode.window.showInformationMessage(`Not parsable input: ${implInput}`);
				return;
			}

			// TODO: automatically detect type name at cursor
			// if matches[1] is undefined then detect receiver type
			// take first character and use as receiver name

			return runGoImpl([matches[1], matches[2]], cursor.start, editor);
		});
};

// TODO(hxjiang): remove impl from the vscode-go extension.
function runGoImpl(args: string[], insertPos: vscode.Position, editor: vscode.TextEditor): Promise<void> {
	return new Promise((resolve) => {
		const goimpl = getBinPath('impl');
		const p = cp.execFile(
			goimpl,
			args,
			{ env: toolExecutionEnvironment(), cwd: dirname(editor.document.fileName) },
			(err, stdout, stderr) => {
				if (err && (<any>err).code === 'ENOENT') {
					void promptForMissingTool('impl');
					return resolve();
				}

				if (err) {
					vscode.window.showInformationMessage(`Cannot stub interface: ${stderr}`);
					return resolve();
				}

				editor
					.edit((editBuilder) => {
						editBuilder.insert(insertPos, stdout);
					})
					.then(
						() => resolve(),
						() => resolve()
					);
			}
		);
		if (p.pid) {
			p.stdin?.end();
		}
	});
}
