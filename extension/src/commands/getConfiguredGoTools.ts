/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';

import { CommandFactory } from '.';
import { getGoConfig } from '../config';
import { inspectGoToolVersion } from '../goInstallTools';
import { getConfiguredTools } from '../goTools';
import { getBinPath, getCurrentGoPath, getGoEnv, getGoVersion, getToolsGopath } from '../util';
import { getEnvPath, initialEnvPath, getCurrentGoRoot } from '../utils/pathUtils';

export const getConfiguredGoTools: CommandFactory = () => {
	return async () => {
		// create an untitled markdown document.
		const buf = [];
		// Tool's path search is done by getBinPathWithPreferredGopath
		// which searches places in the following order
		// 1) absolute path for the alternateTool
		// 2) GOBIN
		// 3) toolsGopath
		// 4) gopath
		// 5) GOROOT
		// 6) PATH
		buf.push('# Tools Configuration\n');
		buf.push('\n## Environment\n');
		buf.push('GOBIN: ' + process.env['GOBIN']);
		buf.push('toolsGopath: ' + getToolsGopath());
		buf.push('gopath: ' + getCurrentGoPath());
		buf.push('GOROOT: ' + getCurrentGoRoot());
		const currentEnvPath = getEnvPath();
		buf.push('PATH: ' + currentEnvPath);
		if (currentEnvPath !== initialEnvPath) {
			buf.push(`PATH (vscode launched with): ${initialEnvPath}`);
		}

		buf.push('\n## Tools\n');
		try {
			const goVersion = await getGoVersion();
			const allTools = getConfiguredTools(getGoConfig());
			const goVersionTooOld = goVersion?.lt('1.18') || false;

			buf.push(`\tgo:\t${goVersion?.binaryPath}: ${goVersion?.version}`);
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
				buf.push(info);
			});
		} catch (e) {
			buf.push(`failed to get tools info: ${e}`);
		}

		let folders = vscode.workspace.workspaceFolders?.map<{ name: string; path?: string }>((folder) => {
			return { name: folder.name, path: folder.uri.fsPath };
		});
		if (!folders) {
			folders = [{ name: 'no folder', path: undefined }];
		}

		buf.push('\n## Go env\n');
		for (const folder of folders) {
			buf.push(`Workspace Folder (${folder.name}): ${folder.path}\n`);
			try {
				const out = await getGoEnv(folder.path);
				// Append '\t' to the beginning of every line (^) of 'out'.
				// 'g' = 'global matching', and 'm' = 'multi-line matching'
				buf.push(out.replace(/^/gm, '\t'));
			} catch (e) {
				buf.push(`failed to run 'go env': ${e}`);
			}
		}

		// create a new untitled document
		const doc = await vscode.workspace.openTextDocument({
			content: buf.join('\n'),
			language: 'markdown'
		});
		await vscode.window.showTextDocument(doc);
	};
};
