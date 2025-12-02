/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import { GoExtensionContext } from '../context';
import { LanguageClient } from 'vscode-languageclient/node';

// ----------------------------------------------------------------------------
// Form Field Type Definitions
// ----------------------------------------------------------------------------

// TODO(hxjiang): extend the support for file input type as a subtype of string.

// FormFieldTypeString defines a text input.
export interface FormFieldTypeString {
	kind: 'string';
}

// FormFieldTypeBool defines a boolean input.
export interface FormFieldTypeBool {
	kind: 'bool';
}

// FormFieldTypeNumber defines a numeric input.
export interface FormFieldTypeNumber {
	kind: 'number';
}

// FormFieldTypeEnum defines a selection from a set of values.
export interface FormFieldTypeEnum {
	kind: 'enum';

	// Name is an optional identifier for the enum type.
	name?: string;

	// Values is the set of allowable options.
	values: string[];

	// Description provides human-readable labels for the options.
	// This array must have the same length as values.
	description: string[];
}

// FormFieldTypeList defines a homogenous list of items.
export interface FormFieldTypeList {
	kind: 'list';

	// ElementType specifies the type of the items in the list.
	// Recursive reference to the union type.
	elementType: FormFieldType;
}

// FormFieldType acts as a Discriminated Union based on the 'kind' property.
export type FormFieldType =
	| FormFieldTypeString
	| FormFieldTypeBool
	| FormFieldTypeNumber
	| FormFieldTypeEnum
	| FormFieldTypeList;

// ----------------------------------------------------------------------------
// Main Form Definitions
// ----------------------------------------------------------------------------

// FormField describes a single question in a form and its validation state.
export interface FormField {
	// Description is the text content of the question (the prompt) presented to the user.
	description: string;

	// Type specifies the data type and validation constraints for the answer.
	type: FormFieldType;

	// Default specifies an optional initial value for the answer.
	// If Type is FormFieldTypeEnum, this value must be present in the enum's values array.
	default?: any;

	// Error provides a validation message from the language server.
	// If empty or undefined, the current answer is considered valid.
	error?: string;
}

export interface InteractiveParams {
	/**
	 * FormFields defines the questions and validation errors.
	 * This is a server-to-client field.
	 */
	formFields?: FormField[];

	/**
	 * FormAnswers contains the values for the form questions.
	 * When sent by the language server, this acts as preserved/previous input.
	 * When sent by the client (in a resolve request), this is required when
	 * formFields are defined.
	 */
	formAnswers?: any[];
}

// ----------------------------------------------------------------------------
// Command Extension
// ----------------------------------------------------------------------------

// InteractiveExecuteCommandParams extends the standard LSP ExecuteCommandParams
// with the experimental fields for interactive forms.
export interface InteractiveExecuteCommandParams extends InteractiveParams {
	/**
	 * The identifier of the actual command handler.
	 */
	command: string;
	/**
	 * Arguments that the command should be invoked with.
	 */
	arguments?: any[];
}

/**
 * MAX_RETRY defined the maximum number of user collection allowed for when
 * resolving a command.
 */
const MAX_RETRY = 5;

export async function ResolveCommand(
	goCtx: GoExtensionContext,
	command: string,
	args: any[]
): Promise<{ command: string; args: any[] } | undefined> {
	// Avoid resolving for frequently triggered commands for performance.
	if (command === 'gopls.package_symbols') {
		return { command: command, args: args };
	}

	// Prevent infinite recursion. Since "gopls.lsp" is the mechanism used to
	// resolve commands, attempting to resolve it would create a nested loop:
	// { command: 'gopls.lsp', args: { method: 'command/resolve', param: { command: 'gopls.lsp'... } } }
	if (command === 'gopls.lsp') {
		return { command: command, args: args };
	}

	const supportLSPCommand = goCtx.serverInfo?.Commands?.includes('gopls.lsp');
	if (!supportLSPCommand) {
		return { command: command, args: args };
	}

	if (goCtx.languageClient === undefined) {
		return { command: command, args: args };
	}

	const protocolCommand = await asProtocolCommand(goCtx.languageClient, command, args);
	let param = {
		command: protocolCommand.command,
		arguments: protocolCommand.arguments
	} as InteractiveExecuteCommandParams;

	// Invoke "command/resolve" at least once to ensure the command
	// is fully specified, as the initial input may lack necessary parameters.
	for (let i = 0; i < MAX_RETRY; i++) {
		const response: any = await vscode.commands.executeCommand('gopls.lsp', {
			method: 'command/resolve',
			param: param
		});

		if (!response) {
			return undefined;
		}

		param = response as InteractiveExecuteCommandParams;

		// No information needed from the gopls.
		if (param.formFields === undefined) {
			break;
		}

		// Exhaust all retries.
		if (i === MAX_RETRY - 1) {
			vscode.window.showWarningMessage(`Retried ${MAX_RETRY} exceeds the maximum allowed attempts`);
			return undefined;
		}

		for (const [index, field] of param.formFields.entries()) {
			if (field.error) {
				vscode.window.showWarningMessage(`Question ${index + 1}: ${field.error}`);
			}
		}

		const answers = await CollectAnswers(param.formFields, param.formAnswers);
		if (answers === undefined) {
			return undefined;
		}
		param.formAnswers = answers;
		param.formFields = undefined;
	}

	return { command: param.command, args: param.arguments ? param.arguments : [] };
}

/**
 * Iterates through the provided form fields and prompts the user for input
 * using VS Code's native UI (InputBox or QuickPick).
 * * @param formFields The fields to collect answers for.
 * @returns An array of answers matching the order of fields, or undefined if the user cancelled the process.
 */
export async function CollectAnswers(
	formFields: FormField[] | undefined,
	formAnswers: any[] | undefined
): Promise<any[] | undefined> {
	if (formFields === undefined) {
		return undefined;
	}

	const answers: any[] = [];

	for (let i = 0; i < formFields.length; i++) {
		const field = formFields[i];
		const previousAnswer = formAnswers && i < formAnswers.length ? formAnswers[i] : undefined;
		const answer = await promptForField(field, previousAnswer);

		// If the user presses Escape or cancels an input box, the result is undefined.
		// In a form wizard, cancelling one usually means cancelling the whole flow.
		if (answer === undefined) {
			return undefined;
		}

		answers.push(answer);
	}

	return answers;
}

/**
 * Helper to prompt for a single field based on its type.
 */
async function promptForField(field: FormField, prevAnswer: any | undefined): Promise<any | undefined> {
	const type = field.type;

	switch (type.kind) {
		case 'string':
			return await vscode.window.showInputBox({
				prompt: field.description,
				value: prevAnswer ? prevAnswer : field.default,
				placeHolder: field.description,
				// Keep the input box open when focus is lost. This allows the
				// user to  browse the workspace or inspect code (e.g., checking
				// destination files or existing struct tags) before answering.
				ignoreFocusOut: true
			} as vscode.InputBoxOptions);

		case 'enum': {
			const descriptions = type.description || [];

			const pickItems = type.values.map((value, index) => {
				const description = descriptions[index];

				return {
					// Use description if it exists, otherwise use value
					label: description || value,
					// Show value in detail if description exists
					description: description ? value : undefined,
					value: value
				};
			});

			const selected = await vscode.window.showQuickPick(pickItems, {
				placeHolder: field.description,
				ignoreFocusOut: true
			});

			return selected ? selected.value : undefined;
		}

		case 'bool': {
			const boolItems = [
				{ label: 'Yes', value: true },
				{ label: 'No', value: false }
			];

			const selectedBool = await vscode.window.showQuickPick(boolItems, {
				placeHolder: field.description,
				ignoreFocusOut: true
			});

			return selectedBool ? selectedBool.value : undefined;
		}

		case 'number': {
			let value: string | undefined;
			if (prevAnswer) {
				value = String(prevAnswer);
			} else if (field.default) {
				value = String(field.default);
			}
			const numResult = await vscode.window.showInputBox({
				prompt: field.description,
				value: value,
				placeHolder: '0',
				ignoreFocusOut: true,
				validateInput: (text) => {
					return isNaN(Number(text)) ? 'Please enter a valid number' : null;
				}
			});

			return numResult !== undefined ? Number(numResult) : undefined;
		}

		case 'list': {
			// Basic support for lists of primitive strings/numbers via comma-separated input
			if (type.elementType.kind === 'string' || type.elementType.kind === 'number') {
				const rawList = await vscode.window.showInputBox({
					prompt: `${field.description} (comma separated)`,
					ignoreFocusOut: true
				});

				if (rawList === undefined) {
					return undefined;
				}

				// If empty input, return empty list
				if (rawList.trim() === '') {
					return [];
				}

				const parts = rawList.split(',').map((s) => s.trim());

				if (type.elementType.kind === 'number') {
					return parts.map(Number).filter((n) => !isNaN(n));
				}
				return parts;
			}

			vscode.window.showErrorMessage(`List input for ${type.elementType.kind} is not supported in this version.`);
			return undefined;
		}

		default:
			return undefined;
	}
}

/**
 * asProtocolCommand uses the language client's converter to transform the input
 * ExecuteCommandParams (i.e. command and args) into LSP-compatible types.
 *
 * This is equivalent of `converter.AsExecuteCommandParams`.
 */
async function asProtocolCommand(
	client: LanguageClient,
	command: string,
	args: any[]
): Promise<{ command: string; arguments: any[] }> {
	// The LanguageClient does not expose a direct method to convert an LSP
	// ExecuteCommandParams. (i.e. there is no converter.AsExecuteCommandParams)
	//
	// However, it does perform this conversion for commands embedded inside
	// CodeActions.
	// We wrap the args in a dummy CodeAction to "piggyback" on this existing
	// logic, ensuring we convert types exactly as the client expects without
	// manual handling.
	const dummyAction = new vscode.CodeAction('dummy', vscode.CodeActionKind.Refactor);
	dummyAction.command = {
		title: 'dummy',
		command: command,
		arguments: args
	};

	const protocolAction = (await client.code2ProtocolConverter.asCodeAction(dummyAction)) as any;

	return {
		command: protocolAction.command?.command,
		arguments: protocolAction.command?.arguments || []
	};
}
