/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { EventEmitter } from 'events';
import * as path from 'path';
import sinon = require('sinon');
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { getGoConfig } from '../../src/config';
import {
	buildLanguageClient,
	BuildLanguageClientOption,
	buildLanguageServerConfig,
	toServerInfo
} from '../../src/language/goLanguageServer';
import { GoExtensionContext } from '../../src/context';

// FakeOutputChannel is a fake output channel used to buffer
// the output of the tested language client in an in-memory
// string array until cleared.
export class FakeOutputChannel implements vscode.OutputChannel {
	public name = 'FakeOutputChannel';
	public show = sinon.fake(); // no-empty
	public hide = sinon.fake(); // no-empty
	public dispose = sinon.fake(); // no-empty
	public replace = sinon.fake(); // no-empty

	private buf = [] as string[];

	private eventEmitter = new EventEmitter();
	private registeredPatterns = new Set<string>();
	public onPattern(msg: string, listener: () => void) {
		this.registeredPatterns.add(msg);
		this.eventEmitter.once(msg, () => {
			this.registeredPatterns.delete(msg);
			listener();
		});
	}

	public append = (v: string) => this.enqueue(v);
	public appendLine = (v: string) => this.enqueue(v);
	public clear = () => {
		this.buf = [];
	};
	public toString = () => {
		return this.buf.join('\n');
	};

	private enqueue = (v: string) => {
		this.registeredPatterns?.forEach((p) => {
			if (v.includes(p)) {
				this.eventEmitter.emit(p);
			}
		});

		if (this.buf.length > 1024) {
			this.buf.shift();
		}
		this.buf.push(v.trim());
	};
}
// Env is a collection of test-related variables and lsp client.
// Currently, this works only in module-aware mode.
export class Env {
	public languageClient?: LanguageClient;
	public goCtx: GoExtensionContext = {};

	private fakeOutputChannel?: FakeOutputChannel;
	private disposables = [] as { dispose(): void }[];

	public flushTrace(print: boolean) {
		if (print) {
			console.log(this.fakeOutputChannel?.toString());
		}
		this.fakeOutputChannel?.clear();
	}

	// This is a hack to check the progress of package loading.
	// TODO(hyangah): use progress message middleware hook instead
	// once it becomes available.
	public onMessageInTrace(msg: string, timeoutMS: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.flushTrace(true);
				reject(`Timed out while waiting for '${msg}'`);
			}, timeoutMS);
			this.fakeOutputChannel?.onPattern(msg, () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}

	// Start the language server with the fakeOutputChannel.
	// if workspaceFolder is provided, gopls will start with it.
	public async startGopls(
		filePath: string | undefined,
		goConfig?: vscode.WorkspaceConfiguration,
		workspaceFolder?: string
	) {
		// file path to open.
		this.fakeOutputChannel = new FakeOutputChannel();
		const pkgLoadingDone = this.onMessageInTrace('Finished loading packages.', 60000);

		if (!goConfig) {
			goConfig = getGoConfig();
		}
		const cfg: BuildLanguageClientOption = buildLanguageServerConfig(
			Object.create(goConfig, {
				useLanguageServer: { value: true },
				languageServerFlags: { value: ['-rpc.trace'] } // enable rpc tracing to monitor progress reports
			})
		);
		cfg.outputChannel = this.fakeOutputChannel; // inject our fake output channel.
		this.goCtx.latestConfig = cfg;
		this.languageClient = await buildLanguageClient(this.goCtx, cfg);
		if (!this.languageClient) {
			throw new Error('Language client not initialized.');
		}

		if (workspaceFolder) {
			this.languageClient.clientOptions.workspaceFolder = {
				uri: vscode.Uri.file(workspaceFolder),
				index: 0,
				name: path.basename(workspaceFolder)
			};
		}
		await this.languageClient.start();
		this.goCtx.languageClient = this.languageClient;
		this.goCtx.serverInfo = toServerInfo(this.languageClient.initializeResult);
		this.goCtx.serverOutputChannel = this.fakeOutputChannel;
		this.goCtx.languageServerIsRunning = this.languageClient?.isRunning();

		if (filePath) {
			await this.openDoc(filePath);
		}
		await pkgLoadingDone;
	}

	public async teardown() {
		try {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			await this.languageClient?.stop(1000); // 1s timeout
		} catch (e) {
			console.log(`failed to stop gopls within 1sec: ${e}`);
		} finally {
			if (this.languageClient?.isRunning()) {
				console.log(`failed to stop language client on time: ${this.languageClient?.state}`);
				this.flushTrace(true);
			}
			for (const d of this.disposables) {
				d.dispose();
			}
			this.languageClient = undefined;
			this.goCtx = {};
		}
	}

	public async openDoc(...paths: string[]) {
		const uri = vscode.Uri.file(path.resolve(...paths));
		const doc = await vscode.workspace.openTextDocument(uri);
		return { uri, doc };
	}
}
