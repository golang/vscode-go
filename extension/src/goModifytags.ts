/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGoConfig } from './config';
import { TelemetryKey, telemetryReporter } from './goTelemetry';

export const COMMAND = 'gopls.modify_tags';

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

export const addTags: CommandFactory = () => async (uri: vscode.Uri) => {
	if (uri) {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOPLS_MODIFY_TAGS_CONTEXT_MENU, 1);
	} else {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOPLS_MODIFY_TAGS_COMMAND_PALETTE, 1);
	}

	const args = getCommonArgs();
	if (!args) {
		return;
	}
	const [tags, options, transformValue, template] = await getTagsAndOptions(getGoConfig()?.addTags);
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
};

export const removeTags: CommandFactory = () => async (uri: vscode.Uri) => {
	if (uri) {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOPLS_MODIFY_TAGS_CONTEXT_MENU, 1);
	} else {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOPLS_MODIFY_TAGS_COMMAND_PALETTE, 1);
	}

	const args = getCommonArgs();
	if (!args) {
		return;
	}
	const [tags, options] = await getTagsAndOptions(getGoConfig()?.removeTags);
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
};

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

async function getTagsAndOptions(config: GoTagsConfig): Promise<(string | undefined)[]> {
	if (!config.promptForTags) {
		return Promise.resolve([config.tags, config.options, config.transform, config.template]);
	}

	const inputTags = await vscode.window.showInputBox({
		value: config.tags,
		prompt: 'Enter comma separated tag names'
	});
	const inputOptions = await vscode.window.showInputBox({
		value: config.options,
		prompt: 'Enter comma separated options'
	});
	const transformOption = await vscode.window.showInputBox({
		value: config.transform,
		prompt: 'Enter transform value'
	});
	const template = await vscode.window.showInputBox({
		value: config.template,
		prompt: 'Enter template value'
	});
	return [inputTags, inputOptions, transformOption, template];
}
