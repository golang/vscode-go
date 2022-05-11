/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { LanguageServerConfig, Restart, ServerInfo } from './language/goLanguageServer';
import { LegacyLanguageService } from './language/registerDefaultProviders';

// Global variables used for management of the language client.
// They are global so that the server can be easily restarted with
// new configurations.
export interface GoExtensionContext {
	languageClient?: LanguageClient;
	legacyLanguageService?: LegacyLanguageService;
	languageServerDisposable?: vscode.Disposable;
	latestConfig?: LanguageServerConfig;
	serverOutputChannel?: vscode.OutputChannel;
	languageServerIsRunning?: boolean;
	// serverInfo is the information from the server received during initialization.
	serverInfo?: ServerInfo;
	// lastUserAction is the time of the last user-triggered change.
	// A user-triggered change is a didOpen, didChange, didSave, or didClose event.
	lastUserAction: Date;
	serverTraceChannel?: vscode.OutputChannel;
	crashCount: number;
	// Some metrics for automated issue reports:
	restartHistory: Restart[];
	buildDiagnosticCollection?: vscode.DiagnosticCollection;
	lintDiagnosticCollection?: vscode.DiagnosticCollection;
	vetDiagnosticCollection?: vscode.DiagnosticCollection;
}
