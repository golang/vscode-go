/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';

import { CommandFactory } from '.';
import { getGoConfig, getGoplsConfig } from '../config';
import { inspectGoToolVersion } from '../goInstallTools';
import { outputChannel } from '../goStatus';
import { getConfiguredTools } from '../goTools';
import { getBinPath, getCurrentGoPath, getGoEnv, getGoVersion, getToolsGopath } from '../util';
import { envPath, getCurrentGoRoot } from '../utils/pathUtils';

export const getConfiguredGoTools: CommandFactory = () => {
	return async () => {
		outputChannel.show();
		outputChannel.clear();
		outputChannel.appendLine('Checking configured tools....');
		// Tool's path search is done by getBinPathWithPreferredGopath
		// which searches places in the following order
		// 1) absolute path for the alternateTool
		// 2) GOBIN
		// 3) toolsGopath
		// 4) gopath
		// 5) GOROOT
		// 6) PATH
		outputChannel.appendLine('GOBIN: ' + process.env['GOBIN']);
		outputChannel.appendLine('toolsGopath: ' + getToolsGopath());
		outputChannel.appendLine('gopath: ' + getCurrentGoPath());
		outputChannel.appendLine('GOROOT: ' + getCurrentGoRoot());
		const currentEnvPath = process.env['PATH'] || (process.platform === 'win32' ? process.env['Path'] : null);
		outputChannel.appendLine('PATH: ' + currentEnvPath);
		if (currentEnvPath !== envPath) {
			outputChannel.appendLine(`PATH (vscode launched with): ${envPath}`);
		}
		outputChannel.appendLine('');

		const goVersion = await getGoVersion();
		const allTools = getConfiguredTools(goVersion, getGoConfig(), getGoplsConfig());
		const goVersionTooOld = goVersion?.lt('1.12') || false;

		outputChannel.appendLine(`\tgo:\t${goVersion?.binaryPath}: ${goVersion?.version}`);
		const toolsInfo = await Promise.all(
			allTools.map(async (tool) => {
				const toolPath = getBinPath(tool.name);
				// TODO(hyangah): print alternate tool info if set.
				if (!path.isAbsolute(toolPath)) {
					// getBinPath returns the absolute path is the tool exists.
					// (See getBinPathWithPreferredGopath which is called underneath)
					return `\t${tool.name}:\tnot installed`;
				}
				if (goVersionTooOld) {
					return `\t${tool.name}:\t${toolPath}: unknown version`;
				}
				const { goVersion, moduleVersion, debugInfo } = await inspectGoToolVersion(toolPath);
				if (goVersion || moduleVersion) {
					return `\t${tool.name}:\t${toolPath}\t(version: ${moduleVersion} built with go: ${goVersion})`;
				} else {
					return `\t${tool.name}:\t${toolPath}\t(version: unknown - ${debugInfo})`;
				}
			})
		);
		toolsInfo.forEach((info) => {
			outputChannel.appendLine(info);
		});

		let folders = vscode.workspace.workspaceFolders?.map<{ name: string; path?: string }>((folder) => {
			return { name: folder.name, path: folder.uri.fsPath };
		});
		if (!folders) {
			folders = [{ name: 'no folder', path: undefined }];
		}

		outputChannel.appendLine('');
		outputChannel.appendLine('go env');
		for (const folder of folders) {
			outputChannel.appendLine(`Workspace Folder (${folder.name}): ${folder.path}`);
			try {
				const out = await getGoEnv(folder.path);
				// Append '\t' to the beginning of every line (^) of 'out'.
				// 'g' = 'global matching', and 'm' = 'multi-line matching'
				outputChannel.appendLine(out.replace(/^/gm, '\t'));
			} catch (e) {
				outputChannel.appendLine(`failed to run 'go env': ${e}`);
			}
		}
	};
};
