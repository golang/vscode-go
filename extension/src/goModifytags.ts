/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGoConfig } from './config';
import { TelemetryKey, telemetryReporter } from './goTelemetry';

export const GOPLS_MODIFY_TAGS_COMMAND = 'gopls.modify_tags';

// Interface for the arguments passed to gopls.modify_tags command. URI and range
// are required parameters collected by the extension based on the open editor,
// and the rest of the args are collected from user settings. gopls prompts the
// user for the tags if neither the tags nor the options are specified.
interface GoModifyTagsArgs {
	URI: string;
	range: vscode.Range;
	modification?: 'add' | 'remove';
	add?: string;
	addOptions?: string;
	remove?: string;
	removeOptions?: string;
	transform?: string;
	valueFormat?: string;
}

// Interface for settings configuration for adding and removing tags
interface GoTagsConfig {
	tags?: string;
	options?: string;
	promptForTags?: boolean;
	transform?: string;
	template?: string;
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

	// Introduced since gopls v0.23.0, but older gopls will ignore this field.
	args.modification = 'add';

	// If promptForTags is set, ignore the settings so that gopls prompts the
	// user. Otherwise, pass the settings along; gopls prompts only if neither
	// tags nor options are set.
	const config = getGoConfig().get<GoTagsConfig>('addTags');
	if (!config?.promptForTags) {
		args.add = config?.tags;
		args.addOptions = config?.options;
		args.transform = config?.transform;
		args.valueFormat = config?.template;
	}
	await vscode.commands.executeCommand(GOPLS_MODIFY_TAGS_COMMAND, args);
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

	// Introduced since gopls v0.23.0, but older gopls will ignore this field.
	args.modification = 'remove';

	// If promptForTags is set, ignore the settings so that gopls prompts the
	// user. Otherwise, pass the settings along; gopls prompts only if neither
	// tags nor options are set.
	const config = getGoConfig().get<GoTagsConfig>('removeTags');
	if (!config?.promptForTags) {
		args.remove = config?.tags;
		args.removeOptions = config?.options;
	}
	await vscode.commands.executeCommand(GOPLS_MODIFY_TAGS_COMMAND, args);
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
