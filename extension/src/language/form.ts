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

// FormFieldTypeDocumentURI defines an input for a file or directory URI.
//
// The client determines the best mechanism to collect this information from
// the user (e.g., a graphical file picker, a text input with autocomplete, etc).
//
// The value returned by the client must be a valid "DocumentUri" as defined
// in the LSP specification:
// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#documentUri
export interface FormFieldTypeDocumentURI {
	kind: 'documentURI';
}

// FormFieldTypeBool defines a boolean input.
export interface FormFieldTypeBool {
	kind: 'bool';
}

// FormFieldTypeNumber defines a numeric input.
export interface FormFieldTypeNumber {
	kind: 'number';
}

// FormEnumEntry represents a single option in an enumeration.
export interface FormEnumEntry {
	// Value is the unique string identifier for this option.
	//
	// This is the value that will be sent back to the server in
	// 'FormAnswers' if the user selects this option.
	value: string;

	// Description is the human-readable label presented to the user.
	description: string;
}

// FormFieldTypeEnum defines a selection from a set of values.
//
// Use this type when:
// - The number of options is small (e.g., < 20).
// - All options are known at the time the form is created.
export interface FormFieldTypeEnum {
	kind: 'enum';

	// Name is an optional identifier for the enum type.
	name?: string;

	// Entries is the list of allowable options.
	entries: FormEnumEntry[];
}

// FormFieldTypeLazyEnum defines a selection from a large or dynamic enum entry set.
//
// Use this type when:
//  1. The dataset is too large to send efficiently in a single payload
//     (e.g., thousands of workspace symbols, file uri or cloud resources).
//  2. The available options depend on the user's input (e.g., semantic search).
//  3. Generating the list is expensive and should only be done if requested.
//
// The client is expected to render a search interface (e.g., a combo box with
// a text input) and query the server via 'interactive/listEnum' as the user types.
export interface FormFieldTypeLazyEnum {
	kind: 'lazyEnum';

	// TODO(hxjiang): consider make debounce configurable since fetching
	// cloud resources could be expensive and slow.

	// Source identifies the data source on the server.
	//
	// Examples: "workspace/symbol", "database/schema", "git/tags".
	source: string;

	// Config contains the static settings for the source.
	// The client treats this as opaque data and echoes it back in the
	// 'interactive/listEnum' request.
	config?: any;
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
	| FormFieldTypeDocumentURI
	| FormFieldTypeBool
	| FormFieldTypeNumber
	| FormFieldTypeEnum
	| FormFieldTypeLazyEnum
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
 * using VS Code's native UI (e.g. InputBox, QuickPick...).
 *
 * Implementation Note:
 * While multiple async calls could start this function simultaneously, a mutex
 * is not needed. VS Code automatically cancels any active input box when a new
 * one is requested. Because this function treats an 'undefined' result as a
 * signal to terminate the entire flow, any previous sessions are effectively
 * dropped, ensuring only the latest interactive refactoring proceeds.
 *
 * * @param formFields The fields to collect answers for.
 * @returns An array of answers matching the order of fields, or undefined if
 * the user cancelled the process.
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

		// An 'undefined' result occurs if the user manually cancels (e.g.,
		// "Escape" or cancel file picker) or if a new refactoring request is
		// triggered, which automatically interrupts and cancels the current
		// active input box.
		// In both cases, we stop the sequence and drop the entire flow.
		if (answer === undefined) {
			return undefined;
		}

		answers.push(answer);
	}

	return answers;
}

/**
 * InteractiveListEnumParams defines the parameters for the
 * 'interactive/listEnum' request.
 */
interface InteractiveListEnumParams {
	/**
	 * Source identifies the data source on the server.
	 *
	 * The client treats this as opaque data and echoes it back in the
	 * 'interactive/listEnum' request.
	 *
	 * Examples: "workspace/symbol", "database/schema", "git/tags".
	 */
	source: string;

	/**
	 * Config contains the static settings for the specified source.
	 *
	 * The client treats this as opaque data and echoes it back in the
	 * 'interactive/listEnum' request.
	 */
	config?: any;

	/**
	 * A query string to filter enum entries by.
	 *
	 * The exact interpretation of this string (e.g., fuzzy matching, exact
	 * match, prefix search, or regular expression) is entirely up to the
	 * server and may vary depending on the source. This follows the similar
	 * semantics as the standard 'workspace/symbol' request. Clients may
	 * send an empty string here to request a default set of enum entries.
	 */
	query: string;
}

/**
 * Opens a Quick Pick that dynamically fetches options from the Language Server.
 */
export async function pickLazyEnum(description: string, source: string, config: any = {}): Promise<string | undefined> {
	return new Promise((resolve) => {
		const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { value: string }>();

		quickPick.title = description;
		quickPick.placeholder = 'Type to search ' + source;
		quickPick.matchOnDescription = true;

		let debounceTimeout: NodeJS.Timeout | undefined;
		let isResolved = false;

		// Call "interactive/listEnum" and render result as entries as quick
		// pick items.
		const search = async (query: string) => {
			quickPick.busy = true;
			try {
				const params: InteractiveListEnumParams = {
					source: source,
					config: config,
					query: query
				};
				const result = await vscode.commands.executeCommand<FormEnumEntry[]>('gopls.lsp', {
					method: 'interactive/listEnum',
					param: params
				});

				if (!result) {
					quickPick.items = [];
					return;
				}

				quickPick.items = result.map((entry) => ({
					label: entry.description,
					detail: entry.value !== entry.description ? entry.value : undefined,
					value: entry.value
				}));
			} catch (e) {
				console.error('Error fetching enum options:', e);
				quickPick.items = [];
			} finally {
				quickPick.busy = false;
			}
		};

		quickPick.onDidChangeValue((value) => {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => search(value), 400);
		});

		quickPick.onDidAccept(() => {
			const selection = quickPick.selectedItems[0];
			isResolved = true;
			resolve(selection ? selection.value : undefined);
			quickPick.hide();
		});

		quickPick.onDidHide(() => {
			if (!isResolved) resolve(undefined);
			quickPick.dispose();
		});

		quickPick.show();
		search(''); // Initial Trigger
	});
}

/**
 * Helper to prompt for a single field based on its type.
 */
async function promptForField(field: FormField, prevAnswer: any | undefined): Promise<any | undefined> {
	const type = field.type;

	switch (type.kind) {
		case 'documentURI': {
			// UX Decision: Explicitly separate "Open" and "Create" flows.
			//
			// We use this "Intent Menu" to bypass a limitation in the
			// native OS Save Dialog.
			//
			// While vscode.window.showSaveDialog allows selecting both new
			// and existing paths, it forces a system-level "Do you want to
			// replace it?" warning if an existing file is selected.
			//
			// Since our server will NOT actually overwrite the file (it
			// just needs the URI), this warning is a false alarm that
			// confuses users. We cannot disable this warning in the OS, so
			// we split the flow:
			//
			// - "Open Existing": Uses showOpenDialog (Clean UX, no warnings)
			// - "Create New": Uses showSaveDialog (The "Overwrite" warning
			// is unavoidable here, but users expect some friction when
			// "creating" over an existing name, so it is acceptable).
			const action = await vscode.window.showQuickPick(
				[
					{
						label: '$(file) Open Existing File',
						description: 'Select a file that already exists',
						target: 'open'
					},
					{
						label: '$(new-file) Create New File',
						description: 'Select a destination for a new file',
						target: 'save'
					}
				],
				{
					placeHolder: field.description || 'Select file action',
					ignoreFocusOut: true
				}
			);

			if (!action) {
				return undefined; // User cancelled
			}

			let defaultUri: vscode.Uri | undefined;
			const defaultUriString = (prevAnswer as string) || (field.default as string);

			if (defaultUriString) {
				try {
					defaultUri = vscode.Uri.parse(defaultUriString);
				} catch {
					// Ignore invalid URIs
				}
			}

			if (action.target === 'open') {
				const uri = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					openLabel: 'Select',
					defaultUri: defaultUri,
					title: field.description || 'Select Existing File'
				});
				return uri && uri[0] ? uri[0].toString() : undefined;
			} else {
				const uri = await vscode.window.showSaveDialog({
					defaultUri: defaultUri,
					saveLabel: 'Select',
					title: field.description || 'Create New File'
				});
				return uri ? uri.toString() : undefined;
			}
		}
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
			const pickItems = type.entries.map((entry, _) => {
				return {
					// Use description if it exists, otherwise use value
					label: entry.description || entry.value,
					// Show value in detail if description exists
					description: entry.description ? entry.value : undefined,
					value: entry.value
				};
			});

			const selected = await vscode.window.showQuickPick(pickItems, {
				placeHolder: field.description,
				ignoreFocusOut: true
			});

			return selected ? selected.value : undefined;
		}

		case 'lazyEnum': {
			return await pickLazyEnum(field.description, type.source, type.config);
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
