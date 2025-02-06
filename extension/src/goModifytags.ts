/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGoConfig } from './config';
import { toolExecutionEnvironment } from './goEnv';
import { promptForMissingTool, promptForUpdatingTool } from './goInstallTools';
import { byteOffsetAt, getBinPath, getFileArchive } from './util';
import { TelemetryKey, telemetryReporter } from './goTelemetry';

const COMMAND = 'gopls.modify_tags';

// Interface for the output from gomodifytags
interface GomodifytagsOutput {
	start: number;
	end: number;
	lines: string[];
}

// Interface for the arguments passed to gopls.modify_tags command. URI and range
// are required parameters collected by the extension based on the open editor,
// and the rest of the args are collected by user input or user settings.
interface GoModifyTagsArgs {
	URI: string;
	range: vscode.Range;
	add?: string;
	addOptions?: string;
	remove?: string;
	removeOptions?: string;
	transform?: string;
	valueFormat?: string;
	clear?: boolean;
	clearOptions?: boolean;
}

// Interface for settings configuration for adding and removing tags
interface GoTagsConfig {
	[key: string]: any;
	tags: string;
	options: string;
	promptForTags: boolean;
	template: string;
}

export const addTags: CommandFactory = (_ctx, goCtx) => async (commandArgs: GoTagsConfig) => {
	const useGoplsCommand = goCtx.serverInfo?.Commands?.includes(COMMAND);
	if (useGoplsCommand) {
		const args = getCommonArgs();
		if (!args) {
			return;
		}
		const [tags, options, transformValue, template] = await getTagsAndOptions(getGoConfig()?.addTags, commandArgs);
		if (!tags && !options) {
			return;
		}
		if (tags) {
			args.add = tags;
		}
		if (options) {
			args.addOptions = options;
		}
		if (transformValue) {
			args.transform = transformValue;
		}
		if (template) {
			args.valueFormat = template;
		}
		await vscode.commands.executeCommand(COMMAND, args);
	} else {
		const args = getCommonArgsOld();
		if (!args) {
			return;
		}
		const [tags, options, transformValue, template] = await getTagsAndOptions(getGoConfig()?.addTags, commandArgs);
		if (!tags && !options) {
			return;
		}
		if (tags) {
			args.push('--add-tags');
			args.push(tags);
		}
		if (options) {
			args.push('--add-options');
			args.push(options);
		}
		if (transformValue) {
			args.push('--transform');
			args.push(transformValue);
		}
		if (template) {
			args.push('--template');
			args.push(template);
		}
		runGomodifytags(args);
	}
};

export const removeTags: CommandFactory = (_ctx, goCtx) => async (commandArgs: GoTagsConfig) => {
	const useGoplsCommand = goCtx.serverInfo?.Commands?.includes(COMMAND);
	if (useGoplsCommand) {
		const args = getCommonArgs();
		if (!args) {
			return;
		}
		const [tags, options] = await getTagsAndOptions(getGoConfig()?.removeTags, commandArgs);
		if (!tags && !options) {
			args.clear = true;
			args.clearOptions = true;
		}
		if (tags) {
			args.remove = tags;
		}
		if (options) {
			args.removeOptions = options;
		}
		vscode.commands.executeCommand(COMMAND, args);
	} else {
		const args = getCommonArgsOld();
		if (!args) {
			return;
		}
		const [tags, options] = await getTagsAndOptions(getGoConfig()?.removeTags, commandArgs);
		if (!tags && !options) {
			args.push('--clear-tags');
			args.push('--clear-options');
		}
		if (tags) {
			args.push('--remove-tags');
			args.push(tags);
		}
		if (options) {
			args.push('--remove-options');
			args.push(options);
		}
		runGomodifytags(args);
	}
};

// getCommonArgsOld produces the flags used for executing the gomodifytags binary.
function getCommonArgsOld(): string[] | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active.');
		return undefined;
	}
	if (!editor.document.fileName.endsWith('.go')) {
		vscode.window.showInformationMessage('Current file is not a Go file.');
		return undefined;
	}
	const args = ['-modified', '-file', editor.document.fileName, '-format', 'json'];
	if (
		editor.selection.start.line === editor.selection.end.line &&
		editor.selection.start.character === editor.selection.end.character
	) {
		// Add tags to the whole struct
		const offset = byteOffsetAt(editor.document, editor.selection.start);
		args.push('-offset');
		args.push(offset.toString());
	} else if (editor.selection.start.line <= editor.selection.end.line) {
		// Add tags to selected lines
		args.push('-line');
		args.push(`${editor.selection.start.line + 1},${editor.selection.end.line + 1}`);
	}

	return args;
}

// getCommonArgs produces the args used for calling the gopls.modify_tags command.
function getCommonArgs(): GoModifyTagsArgs | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active.');
		return undefined;
	}
	if (!editor.document.fileName.endsWith('.go')) {
		vscode.window.showInformationMessage('Current file is not a Go file.');
		return undefined;
	}
	const args: GoModifyTagsArgs = {
		URI: editor.document.uri.toString(),
		range: editor.selection
	};
	return args;
}

async function getTagsAndOptions(config: GoTagsConfig, commandArgs: GoTagsConfig): Promise<(string | undefined)[]> {
	const tags = commandArgs && commandArgs.tags ? commandArgs.tags : config.tags;
	const options = commandArgs && commandArgs.options ? commandArgs.options : config.options;
	const promptForTags = commandArgs && commandArgs.promptForTags ? commandArgs.promptForTags : config.promptForTags;
	const transformValue: string = commandArgs && commandArgs.transform ? commandArgs.transform : config.transform;
	const format: string = commandArgs && commandArgs.template ? commandArgs.template : config.template;

	if (!promptForTags) {
		return Promise.resolve([tags, options, transformValue, format]);
	}

	const inputTags = await vscode.window.showInputBox({
		value: tags,
		prompt: 'Enter comma separated tag names'
	});
	const inputOptions = await vscode.window.showInputBox({
		value: options,
		prompt: 'Enter comma separated options'
	});
	const transformOption = await vscode.window.showInputBox({
		value: transformValue,
		prompt: 'Enter transform value'
	});
	const template = await vscode.window.showInputBox({
		value: format,
		prompt: 'Enter template value'
	});
	return [inputTags, inputOptions, transformOption, template];
}

async function runGomodifytags(args: string[]) {
	telemetryReporter.add(TelemetryKey.TOOL_USAGE_GOMODIFYTAGS, 1);
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const gomodifytags = getBinPath('gomodifytags');
	const input = getFileArchive(editor.document);
	const p = cp.execFile(gomodifytags, args, { env: toolExecutionEnvironment() }, (err, stdout, stderr) => {
		if (err && (<any>err).code === 'ENOENT') {
			promptForMissingTool('gomodifytags');
			return;
		}
		if (err && (<any>err).code === 2 && args.indexOf('--template') > 0) {
			vscode.window.showInformationMessage(
				'Cannot modify tags: you might be using a' + 'version that does not support --template'
			);
			promptForUpdatingTool('gomodifytags');
			return;
		}
		if (err) {
			vscode.window.showInformationMessage(`Cannot modify tags: ${stderr}`);
			return;
		}
		const output = <GomodifytagsOutput>JSON.parse(stdout);
		editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(output.start - 1, 0, output.end, 0), output.lines.join('\n') + '\n');
		});
	});
	if (p.pid) {
		p.stdin?.end(input);
	}
}
