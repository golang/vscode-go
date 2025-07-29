/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { execFile } from 'child_process';
import * as path from 'path';
import { getGoConfig } from './config';
import { promptForMissingTool } from './goInstallTools';
import { outputChannel } from './goStatus';
import { getBinPath } from './util';
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { TelemetryKey, telemetryReporter } from './goTelemetry';

const TOOL_CMD_NAME = 'goplay';

export const playgroundCommand: CommandFactory = () => () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active.');
		return;
	}

	const binaryLocation = getBinPath(TOOL_CMD_NAME);
	if (!path.isAbsolute(binaryLocation)) {
		return promptForMissingTool(TOOL_CMD_NAME);
	}

	outputChannel.show();
	outputChannel.info('Upload to the Go Playground in progress...\n');

	const selection = editor.selection;
	const code = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
	const config: vscode.WorkspaceConfiguration | undefined = getGoConfig(editor.document.uri).get('playground');
	goPlay(code, config).then(
		(result) => {
			outputChannel.info(result);
		},
		(e: string) => {
			if (e) {
				outputChannel.info(e);
			}
		}
	);
};

export function goPlay(code: string, goConfig?: vscode.WorkspaceConfiguration): Thenable<string> {
	telemetryReporter.add(TelemetryKey.TOOL_USAGE_GOPLAY, 1);

	const cliArgs = goConfig ? Object.keys(goConfig).map((key) => `-${key}=${goConfig[key]}`) : [];
	const binaryLocation = getBinPath(TOOL_CMD_NAME);

	return new Promise<string>((resolve, reject) => {
		const p = execFile(binaryLocation, [...cliArgs, '-'], (err, stdout, stderr) => {
			if (err && (<any>err).code === 'ENOENT') {
				promptForMissingTool(TOOL_CMD_NAME);
				return reject();
			}
			if (err) {
				return reject(`Upload to the Go Playground failed.\n${stdout || stderr || err.message}`);
			}
			return resolve(
				`Output from the Go Playground:
${stdout || stderr}
Finished running tool: ${binaryLocation} ${cliArgs.join(' ')} -\n`
			);
		});
		if (p.pid) {
			p.stdin?.end(code);
		}
	});
}
