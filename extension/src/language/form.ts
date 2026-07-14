/* eslint-disable id-blacklist */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable arrow-body-style */
/* eslint-disable no-bitwise */
/* eslint-disable object-shorthand */
/* eslint-disable quotes */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/prefer-function-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* ---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	ClientCapabilities,
	ExecuteCommandSignature,
	FeatureState,
	LanguageClient,
	LanguageClientOptions,
	Middleware,
	RequestType,
	StaticFeature
} from 'vscode-languageclient/node';

// ----------------------------------------------------------------------------
// Form Field Type Definitions
// ----------------------------------------------------------------------------

// TODO(hxjiang): extend the support for file input type as a subtype of string.

// FormFieldTypeString defines a text input.
export interface FormFieldTypeString {
	kind: 'string';

	/* Validators for this form field.
	 *
	 * Field validators only validate the input/answer to a field in isolation
	 * and cannot depend on the answers to other fields. For example a string
	 * field may have a regex validator, or a numeric field may have a range
	 * validator. Multiple validators of the same kind are allowed.
	 *
	 * Answers must pass all (supported) validators to be considered valid.
	 *
	 * Clients must ignore validators they do not support.
	 */
	validators?: StringValidator[];
}

// FileExistence whether the file denoted by a DocumentURI exists.
//
// It is a bit set allowing combinations of existence states. For
// example, New|Existing allows either state.
export enum FileExistence {
	// New indicates that file has not yet been created.
	New = 1 << 0,
	// Existing indicates that the file exists already.
	Existing = 1 << 1
}

// FileType represents the expected filesystem resource type.
//
// It is a bit set allowing combinations of file types. For example, Regular|Directory
// allows either types.
export enum FileType {
	// Regular indicates the resource could be a regular file.
	Regular = 1 << 0,
	// Directory indicates the resource could be a directory.
	Directory = 1 << 1
}

// FormFieldTypeFile defines an input for a file or directory URI.
//
// The client determines the best mechanism to collect this information from
// the user (e.g., a graphical file picker, a text input with autocomplete, etc).
//
// The value returned by the client must be a valid "DocumentUri" as defined
// in the LSP specification:
// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#documentUri
export interface FormFieldTypeFile {
	kind: 'file';

	// Existence constraint.
	existence?: FileExistence;

	// Type specifies the set of allowed file types (regular file, directory, etc).
	//
	// Only applicable against existing file.
	type?: FileType;

	// Filters specifies the allowed file extensions without the leading dot. A file
	// is valid if it matches any of the extensions (OR logic). e.g. ["png", "jpg"].
	//
	// If omitted or empty, no extension filter is applied.
	filters?: string[];
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
	| FormFieldTypeFile
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
	// ID is a unique identifier for this field. This key is used as the property
	// name in FormAnswers to map the user's input back to this specific field.
	id: string;

	// Description is the text content of the question (the prompt) presented to the user.
	description: string;

	// Type specifies the data type and validation constraints for the answer.
	type: FormFieldType;

	// Required specifies whether an answer is absolutely required for this field.
	required: boolean;

	// Default specifies an optional initial value for the answer.
	// If Type is FormFieldTypeEnum, this value must be present in the enum's values array.
	default?: any;

	// Error provides a validation message from the language server.
	// If empty or undefined, the current answer is considered valid.
	error?: string;
}

// FormAnswer describes a single answer to a FormField, identified by its unique
// ID.
export interface FormAnswer {
	// The ID of the FormField being answered.
	id: string;

	// The user's answer value.
	value: any;
}

// InteractiveParams facilitates a multi-step, interactive dialogue between the
// client and server during a Language Server Protocol (LSP) request.
//
// It implements a non-standard protocol extension microsoft/language-server-protocol#1164
// . By embedding this type into standard request parameters (such as
// [ExecuteCommandParams] or [RenameParams]) and pairing them with dedicated
// resolution methods (like [Server.ResolveCommand] or other ResolveXXX handlers),
// standard operations can be transformed into interactive workflows.
//
// Standard LSP resolution methods (like "codeAction/resolve") cannot be used
// for these interactive forms because editors often trigger them eagerly to
// render previews, which would prematurely present UI forms to the user.
// The dedicated ResolveXXX pattern ensures the interactive dialogue strictly
// begins only *after* the user has explicitly indicated intent (for example,
// by clicking a specific Code Action).
//
// The following sequence illustrates the typical handshake, using a code action
// that resolves to a command as an example:
//
//  1. The client requests code actions for the current text selection.
//  2. The server responds with a code action containing a standard LSP Command
//     (title, command, and arguments).
//  3. The client calls [Server.ResolveCommand] with the initial command details
//     wrapped in an [ExecuteCommandParams] to determine if the execution requires
//     interactive input.
//  4. The server responds with an [ExecuteCommandParams]. If user input is
//     required, the server populates the FormFields array with the required schema.
//  5. The client observes the non-empty FormFields and presents a corresponding
//     user interface.
//  6. The user submits their input, and the client issues another
//     [Server.ResolveCommand] request, this time populating the FormAnswers array.
//  7. The server validates the answers. If invalid, it returns a form with error
//     messages attached to specific FormFields. Steps 5-7 repeat until the server
//     omits FormFields entirely, indicating the answers are valid and complete.
//  8. The client calls [Server.ExecuteCommand] with the finalized FormAnswers to
//     execute the action.
//
// The server populates FormFields to define the input schema. If FormFields is
// omitted or empty, the interactive phase is considered complete and the provided
// FormAnswers have been fully validated.
//
// The server may optionally populate FormAnswers alongside FormFields to preserve
// previous user input or provide default values for the client to render.
export interface InteractiveParams {
	// FormFields defines the questions and validation errors in previous
	// answers to the same questions.
	//
	// This is a server-to-client field. The language server defines these, and
	// the client uses them to render the form.
	//
	// The interactive phase is considered complete when the server returns a
	// response where this slice is omitted.
	formFields?: FormField[];

	// FormAnswers contains the answers for the form questions.
	//
	// When sent by the language server, this field is optional and contains the
	// current or default answers to the questions to support editing previous values.
	//
	// When sent by the language client, this field contains the user's answers.
	// Answers are linked to their respective questions using the field's unique
	// `id` rather than their array index. The list must not contain duplicate IDs,
	// and each answer's ID must correspond to a field ID defined in `formFields`.
	//
	// The client must include answers for all required fields (where `required`
	// is true). Answers for optional fields (where `required` is false)
	// may be omitted if no answer was provided, or included if an answer is available.
	formAnswers?: FormAnswer[];
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
 * InteractiveListEnumParams defines the parameters for the
 * 'interactive/listEnum' request.
 */
export interface InteractiveListEnumParams {
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

// ----------------------------------------------------------------------------
// Client Capability
// ----------------------------------------------------------------------------

export interface InteractiveResolveClientCapabilities {
	/**
	 * The input types the client supports for interactive dialogs.
	 * The presence of this field implies support for interactive refactoring.
	 */
	inputTypes?: string[];

	/**
	 * Field validators supported by the client.
	 *
	 * Servers may adapt the validators they include based on this field but
	 * they are not required to. Clients must simply ignore validators they
	 * do not understand. Servers must re-validate all fields as part of
	 * the overall form resolution.
	 *
	 * Clients show higher-severity validation messages before lower severity
	 * messages. If they are only showing the result of one validator they
	 * should process them first by severity, and then the order provided by
	 * the server.
	 */
	validators?: {
		/**
		 * Validators supported on string fields.
		 */
		string?: string[];
	};
}

// ----------------------------------------------------------------------------
// Server Capability
// ----------------------------------------------------------------------------

export interface interactiveResolveOptions {
	/**
	 * The kinds of interactive resolutions that the server supports.
	 *
	 * For example, "command" indicates that the server supports resolving
	 * `ExecuteCommandParams` interactively through "command/resolve".
	 */
	kinds?: string[];
}

/**
 * InteractiveLanguageClientOptions extends LanguageClientOptions with
 * interactive middleware support.
 */
export interface InteractiveLanguageClientOptions extends LanguageClientOptions {
	middleware?: InteractiveMiddleware;
}

/**
 * InteractiveMiddleware extends the standard Language Server Protocol (LSP)
 * `Middleware` to support interactive refactoring workflows.
 *
 * This allows extension authors to intercept key lifecycle events of the
 * interactive dialog, including the command resolution phase, the execution of
 * the validated command, and dynamic enumeration requests for lazy-loaded options.
 */
export type InteractiveMiddleware = Middleware &
	InteractiveListEnumMiddleware &
	InteractiveExecuteCommandMiddleware &
	InteractiveResolveCommandMiddleware;

export interface InteractiveResolveCommandSignature {
	(this: void, param: InteractiveExecuteCommandParams): vscode.ProviderResult<InteractiveExecuteCommandParams>;
}

export interface InteractiveResolveCommandMiddleware {
	interactiveResolveCommand?: (
		this: void,
		param: InteractiveExecuteCommandParams,
		next: InteractiveResolveCommandSignature
	) => vscode.ProviderResult<InteractiveExecuteCommandParams>;
}

/**
 * Signature for the command execution handler with user form answers.
 *
 * This signature is distinct from standard `ExecuteCommandSignature` because it
 * accepts an additional `formAnswers` argument containing user-provided,
 * server-validated inputs.
 */
export interface InteractiveExecuteCommandSignature {
	(this: void, command: string, args: any[], formAnswers: any[]): vscode.ProviderResult<any>;
}

/**
 * InteractiveExecuteCommandMiddleware allows middleware implementations to
 * intercept the execution of commands that require user-provided form answers.
 *
 * Note: This middleware is defined as a new, separate hook rather than reusing
 * the standard `executeCommand` middleware. Reusing the standard middleware
 * would require modifying its signature to accept the additional `formAnswers`
 * parameter, which would break backward compatibility for existing extension
 * middleware configurations.
 */
export interface InteractiveExecuteCommandMiddleware {
	interactiveExecuteCommand?: (
		this: void,
		command: string,
		args: any[],
		formAnswers: any[],
		next: InteractiveExecuteCommandSignature
	) => vscode.ProviderResult<any>;
}

export interface InteractiveListEnumSignature {
	(this: void, param: InteractiveListEnumParams): vscode.ProviderResult<FormEnumEntry[]>;
}

export interface InteractiveListEnumMiddleware {
	interactiveListEnum?: (
		this: void,
		param: InteractiveListEnumParams,
		next: InteractiveListEnumSignature
	) => vscode.ProviderResult<FormEnumEntry[]>;
}

/**
 * The severity of a violation of a validator.
 */
export enum ValidationSeverity {
	/**
	 * An informational message that does not block submission of the value.
	 */
	Info = 1,
	/**
	 * A warning message that does not block submission of the value.
	 */
	Warning = 2,
	/**
	 * An error message that prevents submission of the value.
	 */
	Error = 3
}

export interface Validator {
	/**
	 * The severity of a violation of this validator.
	 */
	severity: ValidationSeverity;

	/**
	 * The message to show if the answer fails this validator.
	 */
	message: string;
}

/**
 * Validators applicable to string fields.
 */
export type StringValidator = RegexValidator /* | FooValidator */;

/**
 * A regex-based validator that ensures an answer matches a given
 * regex.
 */
export interface RegexValidator extends Validator {
	kind: 'regex';

	/**
	 * The regex pattern to validate the input.
	 *
	 * The server must only provide regular expressions for the engine supported by the client
	 * in the `general.regularExpressions` client capability. If the server cannot provide an
	 * appropriate regular expression it should not provide the regex validator.
	 */
	pattern: string;

	/**
	 * Whether the answer matching the pattern means it is valid (no message
	 * reported) or invalid (message reported).
	 */
	matchIsValid: boolean;

	/**
	 * The message to show if the answer is not valid according to `pattern` and `matchIsValid`.
	 */
	message: string;
}

export class InteractiveFormsFeature implements StaticFeature {
	constructor(private readonly client: LanguageClient) {
		this.addMiddleware();
	}

	public clear() {}
	public getState(): FeatureState {
		return { kind: 'static' };
	}
	public initialize() {}

	private addMiddleware() {
		const interactiveOptions = this.client.clientOptions as InteractiveLanguageClientOptions;
		const middleware = interactiveOptions.middleware;
		const original = middleware?.executeCommand;

		// Intercept standard command execution to resolve required inputs interactively.
		// Once resolved, route the execution to the appropriate middleware:
		// - If the command required user answers, execute it using the
		//   "interactiveExecuteCommand" middleware.
		// - If no user answers were collected, execute it using the standard
		//   "executeCommand" middleware.
		const overwrite = async (cmd: string, args: any[], next: ExecuteCommandSignature) => {
			const option = this.client.initializeResult?.capabilities?.experimental?.interactiveResolveProvider as
				| interactiveResolveOptions
				| undefined;

			// Language server does not support interactive command execution.
			if (!option || !Array.isArray(option.kinds) || !option.kinds.includes('command')) {
				return original ? original(cmd, args, next) : next(cmd, args);
			}

			const resolved = await this.resolveCommandInteractively({
				command: cmd,
				arguments: args
			} as InteractiveExecuteCommandParams);
			if (!resolved) {
				return undefined;
			}

			cmd = resolved.command;
			args = resolved.arguments || [];
			const formAnswers = resolved.formAnswers;

			if (formAnswers === undefined || formAnswers.length === 0) {
				// Execute the vscode language client provided "workspace/executeCommand"
				// method if the user does not provide any answers.
				return original ? original(cmd, args, next) : next(cmd, args);
			} else {
				// Execute the interactive language client provided "workspace/executeCommand"
				// method if the user does provide answers.
				return this.interactiveExecuteCommand(cmd, args, formAnswers);
			}
		};

		interactiveOptions.middleware = {
			...middleware,
			executeCommand: overwrite
		};
	}

	/**
	 * Fills in the LSP client capabilities to support interactive refactoring prompts.
	 */
	public fillClientCapabilities(capabilities: ClientCapabilities): void {
		capabilities.experimental ??= {};
		capabilities.experimental.interactiveResolve = {
			inputTypes: ['bool', 'file', 'enum', 'lazyEnum', 'number', 'string'],
			validators: {
				string: ['regex']
			}
		} as InteractiveResolveClientCapabilities;
	}

	/**
	 * MAX_RETRY defines the maximum number of user collection allowed for when
	 * resolving a command.
	 */
	static MAX_RETRY = 5;

	private async resolveCommandInteractively(
		param: InteractiveExecuteCommandParams
	): Promise<InteractiveExecuteCommandParams | undefined> {
		// Invoke "command/resolve" at least once to ensure the command
		// is fully specified, as the initial input may lack necessary parameters.
		for (let i = 0; i < InteractiveFormsFeature.MAX_RETRY; i++) {
			const result = await this.interactiveResolveCommand(param);
			if (!result) {
				return undefined;
			}

			param = result;

			// "formAnswers" are validated by the language server.
			if (param.formFields === undefined) {
				break;
			}

			// Exhaust all retries.
			if (i === InteractiveFormsFeature.MAX_RETRY - 1) {
				vscode.window.showWarningMessage(
					`Retried ${InteractiveFormsFeature.MAX_RETRY} exceeds the maximum allowed attempts`
				);
				return undefined;
			}

			for (const [index, field] of param.formFields.entries()) {
				if (field.error) {
					vscode.window.showWarningMessage(`Question ${index + 1}: ${field.error}`);
				}
			}

			const answers = await this.collectAnswers(param.formFields, param.formAnswers);
			if (answers === undefined) {
				return undefined;
			}
			param.formAnswers = answers;
			param.formFields = undefined;
		}

		return param;
	}

	/**
	 * Executes a command on the language server with the validated form answers.
	 *
	 * It routes the execution through the `interactiveExecuteCommand` middleware
	 * hook if registered, falling back to sending a `'workspace/executeCommand'`
	 * LSP request with the user's answered form.
	 *
	 * @param command The identifier of the actual command handler to execute.
	 * @param args Arguments that the command should be invoked with.
	 * @param formAnswers The finalized, server-validated answers collected from the user.
	 * @returns A provider result resolving to the command execution result.
	 */
	private interactiveExecuteCommand = (
		command: string,
		args: any[],
		formAnswers: any[]
	): vscode.ProviderResult<any> => {
		const _interactiveExecuteCommand: InteractiveExecuteCommandSignature = (command, args, formAnswers) => {
			const requestType = new RequestType<InteractiveExecuteCommandParams, any, void>('workspace/executeCommand');
			return this.client
				.sendRequest<any>('workspace/executeCommand', {
					command: command,
					arguments: args,
					formAnswers: formAnswers
				} as InteractiveExecuteCommandParams)
				.then(undefined, (error) => {
					return this.client.handleFailedRequest(requestType, undefined, error, undefined);
				});
		};

		const middleware = this.client.clientOptions.middleware as InteractiveMiddleware | undefined;
		return middleware?.interactiveExecuteCommand
			? middleware.interactiveExecuteCommand(command, args, formAnswers, _interactiveExecuteCommand)
			: _interactiveExecuteCommand(command, args, formAnswers);
	};

	/**
	 * Handles the interactive resolution of a command prior to its execution.
	 *
	 * It processes an [InteractiveExecuteCommandParams] to determine if the command
	 * requires interactive input, or to validate user-provided answers submitted
	 * via the embedded [InteractiveParams].
	 *
	 * If the command requires user input (e.g., the initial probe) or if the
	 * provided answers are invalid, it returns a modified [InteractiveExecuteCommandParams]
	 * populated with FormFields to prompt the user. If the input is valid and
	 * complete, or if the command requires no interaction at all, it returns an
	 * [InteractiveExecuteCommandParams] with an empty form, signaling the client to
	 * proceed with execution.
	 *
	 * See [InteractiveParams] for the complete multi-step client-server handshake
	 * and the architectural reasoning behind dedicated ResolveXXX methods.
	 *
	 * It routes the resolution through the `interactiveResolveCommand`
	 * middleware hook if registered, falling back to sending a `'command/resolve'`
	 * LSP request.
	 *
	 * @param param The command parameters and previous answers to resolve/validate.
	 * @returns A provider result resolving to the updated command execution parameters.
	 */
	private interactiveResolveCommand = (
		param: InteractiveExecuteCommandParams
	): vscode.ProviderResult<InteractiveExecuteCommandParams> => {
		const _interactiveResolveCommand: InteractiveResolveCommandSignature = (param) => {
			const requestType = new RequestType<InteractiveExecuteCommandParams, any, void>('command/resolve');
			return this.client
				.sendRequest<InteractiveExecuteCommandParams>('command/resolve', param)
				.then(undefined, (error) => {
					return this.client.handleFailedRequest(requestType, undefined, error, undefined);
				});
		};

		const middleware = this.client.clientOptions.middleware as InteractiveMiddleware | undefined;
		return middleware?.interactiveResolveCommand
			? middleware.interactiveResolveCommand(param, _interactiveResolveCommand)
			: _interactiveResolveCommand(param);
	};

	/**
	 * Queries the language server to dynamically retrieve enumeration entries for
	 * interactive form fields of type `'lazyEnum'`.
	 *
	 * It routes the query through the `interactiveListEnum` middleware hook if
	 * registered, falling back to sending an `'interactive/listEnum'` LSP request.
	 *
	 * @param param The query parameters, including the data source name, static
	 * config, and filter string.
	 * @returns A provider result resolving to the matching list of form
	 * enumeration entries.
	 */
	private interactiveListEnum = (param: InteractiveListEnumParams): vscode.ProviderResult<FormEnumEntry[]> => {
		const _interactiveListEnum: InteractiveListEnumSignature = (param) => {
			const requestType = new RequestType<InteractiveListEnumParams, FormEnumEntry[], void>(
				'interactive/listEnum'
			);
			return this.client.sendRequest<FormEnumEntry[]>('interactive/listEnum', param).then(undefined, (error) => {
				return this.client.handleFailedRequest(requestType, undefined, error, undefined);
			});
		};

		const middleware = this.client.clientOptions.middleware as InteractiveMiddleware | undefined;
		return middleware?.interactiveListEnum
			? middleware.interactiveListEnum(param, _interactiveListEnum)
			: _interactiveListEnum(param);
	};

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
	 * @param formFields The fields to collect answers for.
	 * @returns An array of answers matching the order of fields, or undefined if
	 * the user cancelled the process.
	 */
	private async collectAnswers(
		formFields: FormField[] | undefined,
		formAnswers: FormAnswer[] | undefined
	): Promise<FormAnswer[] | undefined> {
		if (formFields === undefined) {
			return undefined;
		}

		const previousAnswers = new Map<string, any>();
		if (formAnswers) {
			for (const answer of formAnswers) {
				previousAnswers.set(answer.id, answer.value);
			}
		}

		const answers: FormAnswer[] = [];

		for (const field of formFields) {
			const previousAnswer = previousAnswers.get(field.id);
			if (previousAnswer !== undefined && field.error === undefined) {
				answers.push({ id: field.id, value: previousAnswer } as FormAnswer);
				continue;
			}

			const value = await this.promptForField(field, previousAnswer);

			// An 'undefined' result occurs if the user manually cancels (e.g.,
			// "Escape" or cancel file picker) or if a new refactoring request is
			// triggered, which automatically interrupts and cancels the current
			// active input box.
			// In both cases, we stop the sequence and drop the entire flow.
			if (value === undefined) {
				return undefined;
			}

			answers.push({
				id: field.id,
				value: value
			} as FormAnswer);
		}

		return answers;
	}

	/**
	 * Opens a Quick Pick that dynamically fetches options from the Language Server.
	 */
	private async pickLazyEnum(description: string, source: string, config: any = {}): Promise<string | undefined> {
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
					const response = await this.interactiveListEnum(params);

					if (!response) {
						quickPick.items = [];
						return;
					}

					quickPick.items = response.map((entry) => ({
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
			void search(''); // Initial Trigger
		});
	}

	/**
	 * Validates a string, returning a user-facing error message if it's not valid.
	 */
	private validateString(
		text: string,
		fieldType: FormFieldTypeString,
		{ required }: { required: boolean }
	): vscode.InputBoxValidationMessage | null {
		if (text.trim() === '') {
			return required ? this.error('Please enter a value') : null;
		}

		if (fieldType.validators) {
			for (const validator of this.sortedValidators(fieldType.validators)) {
				if (validator.kind === 'regex') {
					let isMatch: boolean;
					try {
						isMatch = new RegExp(validator.pattern).test(text);
					} catch {
						// If the regex pattern is invalid, skip over this validator.
						continue;
					}
					if (isMatch !== validator.matchIsValid) {
						const message = validator.message;
						// ValidationSeverity and vscode.InputBoxValidationSeverity match.
						const severity = (validator.severity as unknown) as vscode.InputBoxValidationSeverity;
						return { message, severity };
					}
				}
			}
		}

		return null;
	}

	/**
	 * Sorts validators so that highest severity validators are first, but
	 * within each severity they preserve the original order.
	 *
	 * Validating a single value in this order means we can stop validating on
	 * the first validation message.
	 */
	private sortedValidators<T extends Validator>(validators: T[]): T[] {
		return validators.slice().sort((a, b) => b.severity - a.severity);
	}

	/**
	 * Validates a number, returning a user-facing error message if it's not valid.
	 */
	private validateNumber(
		text: string,
		{ required, isList }: { required: boolean; isList: boolean }
	): vscode.InputBoxValidationMessage | null {
		if (text.trim() === '') return required ? this.error('Please enter a number') : null;
		return !Number.isFinite(Number(text))
			? this.error(isList ? 'Please enter only valid numbers' : 'Please enter a valid number')
			: null;
	}

	private error(message: string): vscode.InputBoxValidationMessage {
		return { message, severity: vscode.InputBoxValidationSeverity.Error };
	}

	/**
	 * Helper to prompt for a single field based on its type.
	 *
	 * Returns `undefined` if an input is cancelled.
	 * Returns `null` if an answer was skipped/no answer (for example an empty input).
	 */
	private async promptForField(field: FormField, prevAnswer: any | undefined): Promise<any | undefined> {
		const fieldType = field.type;

		switch (fieldType.kind) {
			case 'file': {
				let canSelectFiles = true;
				let canSelectFolders = true;
				if (fieldType.type !== undefined) {
					canSelectFiles = (fieldType.type & FileType.Regular) !== 0;
					canSelectFolders = (fieldType.type & FileType.Directory) !== 0;

					// Safe fallback: if the constraint evaluates to allowing neither (which is
					// likely a bug/misconfiguration in the language server), allow both so
					// the file picker dialog is not completely disabled.
					if (!canSelectFiles && !canSelectFolders) {
						canSelectFiles = true;
						canSelectFolders = true;
					}
				}

				let resourceName = 'File or Folder';
				let openIcon = '$(file)';
				let newIcon = '$(new-file)';
				if (canSelectFiles && !canSelectFolders) {
					resourceName = 'File';
					openIcon = '$(file)';
					newIcon = '$(new-file)';
				} else if (!canSelectFiles && canSelectFolders) {
					resourceName = 'Folder';
					openIcon = '$(folder)';
					newIcon = '$(new-folder)';
				}

				let actionTarget: 'open' | 'save' | undefined;
				if (fieldType.existence !== undefined) {
					const allowsNew = (fieldType.existence & FileExistence.New) !== 0;
					const allowsExisting = (fieldType.existence & FileExistence.Existing) !== 0;
					if (allowsNew && !allowsExisting) {
						actionTarget = 'save';
					} else if (allowsExisting && !allowsNew) {
						actionTarget = 'open';
					}
				}

				if (actionTarget === undefined) {
					// UX Decision: If the file existence constraint is not specified or
					// allows both options, we explicitly separate the "Open" and "Create"
					// flows to bypass a limitation in the native OS Save Dialog.
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
					// - "Select Existing": Uses showOpenDialog (Clean UX, no warnings)
					// - "Create New": Uses showSaveDialog (The "Overwrite" warning
					// is unavoidable here, but users expect some friction when
					// "creating" over an existing name, so it is acceptable).
					const action = await vscode.window.showQuickPick(
						[
							{
								label: `${openIcon} Select Existing ${resourceName}`,
								description: `Select a ${resourceName.toLowerCase()} that already exists`,
								target: 'open' as const
							},
							{
								label: `${newIcon} Create New ${resourceName}`,
								description: `Select a destination for a new ${resourceName.toLowerCase()}`,
								target: 'save' as const
							}
						],
						{
							placeHolder: field.description || `Select ${resourceName.toLowerCase()} action`,
							ignoreFocusOut: true
						}
					);

					if (!action) {
						return undefined; // User cancelled
					}
					actionTarget = action.target;
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

				let filters: { [name: string]: string[] } | undefined;
				if (fieldType.filters && fieldType.filters.length > 0) {
					filters = {
						'Supported Files': fieldType.filters
					};
				}

				if (actionTarget === 'open') {
					const uri = await vscode.window.showOpenDialog({
						canSelectFiles: canSelectFiles,
						canSelectFolders: canSelectFolders,
						canSelectMany: false,
						openLabel: 'Select',
						defaultUri: defaultUri,
						filters: canSelectFiles ? filters : undefined,
						title: field.description || `Select Existing ${resourceName}`
					} as vscode.OpenDialogOptions);
					return uri?.[0] ? uri[0].toString() : undefined;
				} else {
					const uri = await vscode.window.showSaveDialog({
						defaultUri: defaultUri,
						saveLabel: 'Select',
						filters: filters,
						title: field.description || `Create New ${resourceName}`
					} as vscode.SaveDialogOptions);
					return uri ? uri.toString() : undefined;
				}
			}
			case 'string': {
				const value = await vscode.window.showInputBox({
					prompt: field.description,
					value: prevAnswer !== undefined && prevAnswer !== null ? prevAnswer : field.default,
					placeHolder: field.description,
					// Keep the input box open when focus is lost. This allows the
					// user to  browse the workspace or inspect code (e.g., checking
					// destination files or existing struct tags) before answering.
					ignoreFocusOut: true,
					validateInput: (text) => this.validateString(text, fieldType, { required: field.required })
				} as vscode.InputBoxOptions);

				if (value === undefined) {
					return undefined; // Cancelled.
				}
				if (value.trim() === '') {
					return null; // Treat empty as no answer.
				}
				return value;
			}

			case 'enum': {
				const pickItems = fieldType.entries.map((entry, _) => {
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
				return await this.pickLazyEnum(field.description, fieldType.source, fieldType.config);
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
				if (prevAnswer !== undefined && prevAnswer !== null) {
					value = String(prevAnswer);
				} else if (field.default !== undefined && field.default !== null) {
					value = String(field.default);
				}
				const numResult = await vscode.window.showInputBox({
					prompt: field.description,
					value: value,
					placeHolder: '0',
					ignoreFocusOut: true,
					validateInput: (text) => this.validateNumber(text, { required: field.required, isList: false })
				});

				if (numResult === undefined) {
					return undefined; // Cancelled.
				}
				if (numResult.trim() === '') {
					return null; // Treat empty as no answer.
				}
				return Number(numResult);
			}

			case 'list': {
				// Basic support for lists of primitive strings/numbers via comma-separated input
				if (fieldType.elementType.kind === 'string' || fieldType.elementType.kind === 'number') {
					const rawList = await vscode.window.showInputBox({
						prompt: `${field.description} (comma separated)`,
						ignoreFocusOut: true,
						validateInput: (text) => {
							if (text.trim() === '') {
								return field.required ? this.error('Please enter at least one item') : null;
							}
							const parts = text.split(',').map((s) => s.trim());
							if (fieldType.elementType.kind === 'string') {
								// For a list, we need to validate each item but keep the most severe validation
								// message across all.
								let mostSevereValidationIssue: vscode.InputBoxValidationMessage | undefined;
								for (const part of parts) {
									const partValidationResult = this.validateString(part, fieldType.elementType, {
										required: true
									});
									if (partValidationResult) {
										if (
											!mostSevereValidationIssue ||
											partValidationResult.severity > mostSevereValidationIssue.severity
										) {
											mostSevereValidationIssue = partValidationResult;
										}
									}
								}
								if (mostSevereValidationIssue) {
									return mostSevereValidationIssue;
								}
							} else if (fieldType.elementType.kind === 'number') {
								for (const part of parts) {
									const partValidationResult = this.validateNumber(part, {
										required: true,
										isList: true
									});
									if (partValidationResult) {
										return partValidationResult;
									}
								}
							}
							return null;
						}
					});

					if (rawList === undefined) {
						return undefined; // Cancelled.
					}

					if (rawList.trim() === '') {
						// Treat empty as no answer. We shouldn't get here if required because
						// of validation.
						return null;
					}

					const parts = rawList.split(',').map((s) => s.trim());
					if (fieldType.elementType.kind === 'number') {
						// Validation should prevent us having NaNs here.
						return parts.map(Number);
					}
					return parts;
				}

				vscode.window.showErrorMessage(
					`List input for ${fieldType.elementType.kind} is not supported in this version.`
				);
				return undefined;
			}

			default:
				return undefined;
		}
	}
}
