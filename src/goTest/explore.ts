/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import {
	ConfigurationChangeEvent,
	ExtensionContext,
	Range,
	TestController,
	TestItem,
	TestItemCollection,
	TestRunProfileKind,
	TextDocument,
	TextDocumentChangeEvent,
	Uri,
	workspace,
	WorkspaceFoldersChangeEvent
} from 'vscode';
import vscode = require('vscode');
import { GoDocumentSymbolProvider } from '../goOutline';
import { outputChannel } from '../goStatus';
import { dispose, disposeIfEmpty, findItem, GoTest, Workspace } from './utils';
import { GoTestResolver, ProvideSymbols } from './resolve';
import { GoTestRunner } from './run';

// Set true only if the Testing API is available (VSCode version >= 1.59).
export const isVscodeTestingAPIAvailable =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	'object' === typeof (vscode as any).tests && 'function' === typeof (vscode as any).tests.createTestController;

// Check whether the process is running as a test.
function isInTest() {
	return process.env.VSCODE_GO_IN_TEST === '1';
}

export class GoTestExplorer {
	static setup(context: ExtensionContext): GoTestExplorer {
		if (!isVscodeTestingAPIAvailable) throw new Error('VSCode Testing API is unavailable');

		const ctrl = vscode.tests.createTestController('go', 'Go');
		const symProvider = new GoDocumentSymbolProvider(true);
		const inst = new this(workspace, ctrl, (doc, token) => symProvider.provideDocumentSymbols(doc, token));

		context.subscriptions.push(ctrl);

		context.subscriptions.push(
			workspace.onDidChangeConfiguration(async (x) => {
				try {
					await inst.didChangeConfiguration(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidChangeConfiguration': ${error}`);
				}
			})
		);

		context.subscriptions.push(
			workspace.onDidOpenTextDocument(async (x) => {
				try {
					await inst.didOpenTextDocument(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidOpenTextDocument': ${error}`);
				}
			})
		);

		context.subscriptions.push(
			workspace.onDidChangeTextDocument(async (x) => {
				try {
					await inst.didChangeTextDocument(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidChangeTextDocument': ${error}`);
				}
			})
		);

		context.subscriptions.push(
			workspace.onDidChangeWorkspaceFolders(async (x) => {
				try {
					await inst.didChangeWorkspaceFolders(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidChangeWorkspaceFolders': ${error}`);
				}
			})
		);

		const watcher = workspace.createFileSystemWatcher('**/*_test.go', false, true, false);
		context.subscriptions.push(watcher);
		context.subscriptions.push(
			watcher.onDidCreate(async (x) => {
				try {
					await inst.didCreateFile(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'FileSystemWatcher.onDidCreate': ${error}`);
				}
			})
		);
		context.subscriptions.push(
			watcher.onDidDelete(async (x) => {
				try {
					await inst.didDeleteFile(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'FileSystemWatcher.onDidDelete': ${error}`);
				}
			})
		);

		return inst;
	}

	public readonly resolver: GoTestResolver;

	constructor(
		private readonly workspace: Workspace,
		private readonly ctrl: TestController,
		provideDocumentSymbols: ProvideSymbols
	) {
		const resolver = new GoTestResolver(workspace, ctrl, provideDocumentSymbols);
		const runner = new GoTestRunner(workspace, ctrl, resolver);

		this.resolver = resolver;

		ctrl.resolveHandler = async (item) => {
			try {
				await resolver.resolve(item);
			} catch (error) {
				if (isInTest()) throw error;

				const m = 'Failed to resolve tests';
				outputChannel.appendLine(`${m}: ${error}`);
				await vscode.window.showErrorMessage(m);
			}
		};

		ctrl.createRunProfile(
			'go test',
			TestRunProfileKind.Run,
			async (request, token) => {
				try {
					await runner.run(request, token);
				} catch (error) {
					const m = 'Failed to execute tests';
					outputChannel.appendLine(`${m}: ${error}`);
					await vscode.window.showErrorMessage(m);
				}
			},
			true
		);
	}

	/* ***** Listeners ***** */

	protected async didOpenTextDocument(doc: TextDocument) {
		await this.documentUpdate(doc);
	}

	protected async didChangeTextDocument(e: TextDocumentChangeEvent) {
		await this.documentUpdate(
			e.document,
			e.contentChanges.map((x) => x.range)
		);
	}

	protected async didChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent) {
		if (e.added.length > 0) {
			await this.resolver.resolve();
		}

		if (e.removed.length === 0) {
			return;
		}

		this.ctrl.items.forEach((item) => {
			const { kind } = GoTest.parseId(item.id);
			if (kind === 'package') {
				return;
			}

			const ws = this.workspace.getWorkspaceFolder(item.uri);
			if (!ws) {
				dispose(item);
			}
		});
	}

	protected async didCreateFile(file: Uri) {
		await this.documentUpdate(await this.workspace.openTextDocument(file));
	}

	protected async didDeleteFile(file: Uri) {
		const id = GoTest.id(file, 'file');
		function find(children: TestItemCollection): TestItem {
			return findItem(children, (item) => {
				if (item.id === id) {
					return item;
				}

				if (!file.path.startsWith(item.uri.path)) {
					return;
				}

				return find(item.children);
			});
		}

		const found = find(this.ctrl.items);
		if (found) {
			dispose(found);
			disposeIfEmpty(found.parent);
		}
	}

	protected async didChangeConfiguration(e: ConfigurationChangeEvent) {
		let update = false;
		this.ctrl.items.forEach((item) => {
			if (e.affectsConfiguration('go.testExplorerPackages', item.uri)) {
				dispose(item);
				update = true;
			}
		});

		if (update) {
			this.resolver.resolve();
		}
	}

	// Handle opened documents, document changes, and file creation.
	private async documentUpdate(doc: TextDocument, ranges?: Range[]) {
		if (doc.uri.scheme === 'git') {
			// TODO(firelizzard18): When a workspace is reopened, VSCode passes us git: URIs. Why?
			const { path } = JSON.parse(doc.uri.query);
			doc = await vscode.workspace.openTextDocument(path);
		}

		if (!doc.uri.path.endsWith('_test.go')) {
			return;
		}

		await this.resolver.processDocument(doc, ranges);
	}
}
