/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import {
	CancellationToken,
	DocumentSymbol,
	FileType,
	Range,
	SymbolKind,
	TestController,
	TestItem,
	TestItemCollection,
	TextDocument,
	Uri,
	workspace,
	WorkspaceFolder
} from 'vscode';
import path = require('path');
import vscode = require('vscode');
import { outputChannel } from '../goStatus';
import { getModFolderPath } from '../goModules';
import { getCurrentGoPath } from '../util';
import { getGoConfig } from '../config';
import { dispose, disposeIfEmpty, FileSystem, GoTest, GoTestKind, findModuleName, isInTest, Workspace } from './utils';
import { walk, WalkStop } from './walk';
import { importsTestify } from '../testUtils';

export type ProvideSymbols = (doc: TextDocument, token?: CancellationToken) => Thenable<DocumentSymbol[]>;

const testFuncRegex = /^(?<name>(?<kind>Test|Benchmark|Example|Fuzz)($|\P{Ll}.*))/u;
const testMethodRegex = /^\(\*(?<type>[^)]+)\)\.(?<name>(?<kind>Test)($|\P{Ll}.*))$/u;
const runTestSuiteRegex = /^\s*suite\.Run\(\w+,\s*(?:&?(?<type1>\w+)\{\}|new\((?<type2>\w+)\))\)/mu;

interface TestSuite {
	func?: TestItem;
	methods: Set<TestItem>;
}

export class GoTestResolver {
	public readonly all = new Map<string, TestItem>();
	public readonly isDynamicSubtest = new WeakSet<TestItem>();
	public readonly isTestMethod = new WeakSet<TestItem>();
	public readonly isTestSuiteFunc = new WeakSet<TestItem>();
	public readonly shouldIndexAll = getGoConfig().get('testExplorer.indexEntireWorkspace');
	private readonly testSuites = new Map<string, TestSuite>();

	constructor(
		private readonly workspace: Workspace,
		private readonly ctrl: TestController,
		private readonly provideDocumentSymbols: ProvideSymbols
	) {
		ctrl.resolveHandler = async (item) => {
			try {
				await this.resolve(item);
				this.updateGoTestContext();
			} catch (error) {
				if (isInTest()) throw error;

				const m = 'Failed to resolve tests';
				outputChannel.appendLine(`${m}: ${error}`);
				await vscode.window.showErrorMessage(m);
			}
		};
	}

	get items() {
		return this.ctrl.items;
	}

	async resolve(item?: TestItem) {
		// Expand the root item - find all modules and workspaces
		if (!item) {
			// Dispose of package entries at the root if they are now part of a workspace folder
			this.ctrl.items.forEach((item) => {
				const { kind } = GoTest.parseId(item.id);
				if (kind !== 'package') {
					return;
				}

				if (item.uri && this.workspace.getWorkspaceFolder(item.uri)) {
					dispose(this, item);
				}
			});

			if (!this.shouldIndexAll) return;

			// Create entries for all modules and workspaces, if indexing the entire workspace.
			for (const folder of this.workspace.workspaceFolders || []) {
				const found = await walkWorkspaces(this.workspace.fs, folder.uri);
				let needWorkspace = false;
				for (const [uri, isMod] of found.entries()) {
					if (!isMod) {
						needWorkspace = true;
						continue;
					}

					await this.getModule(Uri.parse(uri));
				}

				// If the workspace folder contains any Go files not in a module, create a workspace entry
				if (needWorkspace) {
					await this.getWorkspace(folder);
				}
			}
			return;
		}

		const { kind } = GoTest.parseId(item.id);

		if (!item.uri) return;
		// The user expanded a module or workspace - find all packages
		// Always skipped if not indexing the entire workspace
		if ((kind === 'module' || kind === 'workspace') && this.shouldIndexAll) {
			await walkPackages(this.workspace.fs, item.uri, async (uri) => {
				await this.getPackage(uri);
			});
		}

		// The user expanded a module or package - find all files
		if (kind === 'module' || kind === 'package') {
			for (const [file, type] of await this.workspace.fs.readDirectory(item.uri)) {
				if (type !== FileType.File || !file.endsWith('_test.go')) {
					continue;
				}

				await this.getFile(Uri.joinPath(item.uri, file));
			}
		}

		// The user expanded a file - find all functions
		if (kind === 'file') {
			const doc = await this.workspace.openTextDocument(item.uri);
			await this.processDocument(doc);
		}

		// TODO(firelizzard18): If uri.query is test or benchmark, this is where we
		// would discover sub tests or benchmarks, if that is feasible.
	}

	// Find test items related to the given resource
	find(resource: Uri): TestItem[] {
		const findStr = resource.toString();
		const found: TestItem[] = [];

		function find(items: TestItemCollection) {
			items.forEach((item) => {
				const itemStr = item.uri?.toString();
				if (findStr === itemStr) {
					found.push(item);
					find(item.children);
				} else if (itemStr && findStr.startsWith(itemStr)) {
					find(item.children);
				}
			});
		}

		find(this.ctrl.items);
		return found;
	}

	get allItems() {
		function* it(coll: TestItemCollection): Generator<TestItem> {
			const arr: TestItem[] = [];
			coll.forEach((x) => arr.push(x));

			for (const item of arr) {
				yield item;
				yield* it(item.children);
			}
		}

		return it(this.items);
	}

	// Create or Retrieve a sub test or benchmark. The ID will be of the form:
	//     file:///path/to/mod/file.go?test#TestXxx%2fA%2fB%2fC
	getOrCreateSubTest(item: TestItem, label: string, name: string, dynamic?: boolean): TestItem | undefined {
		if (!item.uri) return;
		const { kind } = GoTest.parseId(item.id);

		let existing: TestItem | undefined;
		item.children.forEach((child) => {
			if (child.label === name) existing = child;
		});
		if (existing) return existing;

		item.canResolveChildren = true;
		const sub = this.createItem(label, item.uri, kind, name);
		item.children.add(sub);

		if (dynamic) {
			this.isDynamicSubtest.add(sub);
			if (this.shouldSetRange(item)) {
				sub.range = item.range;
			}
		}

		return sub;
	}

	// Processes a Go document, calling processSymbol for each symbol in the
	// document.
	//
	// Any previously existing tests that no longer have a corresponding symbol in
	// the file will be disposed. If the document contains no tests, it will be
	// disposed.
	async processDocument(doc: TextDocument, ranges?: Range[]) {
		const seen = new Set<string>();
		const item = await this.getFile(doc.uri);
		const symbols = await this.provideDocumentSymbols(doc);
		const testify = importsTestify(symbols);
		for (const symbol of symbols) {
			await this.processSymbol(doc, item, seen, testify, symbol);
		}

		item.children.forEach((child) => {
			const { name } = GoTest.parseId(child.id);
			if (!name || !seen.has(name)) {
				dispose(this, child);
				return;
			}

			if (ranges?.some((r) => !!child.range?.intersection(r))) {
				item.children.forEach((x) => dispose(this, x));
			}
		});

		disposeIfEmpty(this, item);
	}

	public updateGoTestContext() {
		const items = [];
		for (const item of this.allItems) {
			items.push(item.id);
		}
		vscode.commands.executeCommand('setContext', 'go.tests', items);
	}

	// Retrieve or create an item for a Go file.
	public async getFile(uri: Uri): Promise<TestItem> {
		const dir = path.dirname(uri.path);
		const pkg = await this.getPackage(uri.with({ path: dir, query: '', fragment: '' }));
		const existing = this.getItem(pkg, uri, 'file');
		if (existing) {
			return existing;
		}

		const label = path.basename(uri.path);
		const item = this.getOrCreateItem(pkg, label, uri, 'file');
		item.canResolveChildren = true;
		return item;
	}

	/* ***** Private ***** */

	private shouldSetRange(item: TestItem): boolean {
		const config = getGoConfig(item.uri);
		return !!config.get<boolean>('testExplorer.showDynamicSubtestsInEditor');
	}

	// Create an item.
	private createItem(label: string, uri: Uri, kind: GoTestKind, name?: string): TestItem {
		const id = GoTest.id(uri, kind, name);
		const item = this.ctrl.createTestItem(id, label, uri.with({ query: '', fragment: '' }));
		this.all.set(id, item);
		return item;
	}

	// Retrieve an item.
	private getItem(parent: TestItem | undefined, uri: Uri, kind: GoTestKind, name?: string): TestItem | undefined {
		return (parent?.children || this.ctrl.items).get(GoTest.id(uri, kind, name));
	}

	// Create or retrieve an item.
	private getOrCreateItem(
		parent: TestItem | undefined,
		label: string,
		uri: Uri,
		kind: GoTestKind,
		name?: string
	): TestItem {
		const existing = this.getItem(parent, uri, kind, name);
		if (existing) return existing;

		const item = this.createItem(label, uri, kind, name);
		(parent?.children || this.ctrl.items).add(item);
		return item;
	}

	// If a test/benchmark with children is relocated, update the children's
	// location.
	private relocateChildren(item: TestItem) {
		item.children.forEach((child) => {
			if (!this.isDynamicSubtest.has(child)) return;
			if (!this.shouldSetRange(child)) return;

			child.range = item.range;
			this.relocateChildren(child);
		});
	}

	// Retrieve or create an item for a Go module.
	private async getModule(uri: Uri): Promise<TestItem> {
		const existing = this.getItem(undefined, uri, 'module');
		if (existing) {
			return existing;
		}

		// Read go.mod
		const goMod = Uri.joinPath(uri, 'go.mod');
		const contents = await this.workspace.fs.readFile(goMod);

		// Use the module name as the label
		const label = findModuleName(contents.toString());
		const item = this.getOrCreateItem(undefined, label, uri, 'module');
		item.canResolveChildren = true;
		return item;
	}

	// Retrieve or create an item for a workspace folder that is not a module.
	private async getWorkspace(ws: WorkspaceFolder): Promise<TestItem> {
		const existing = this.getItem(undefined, ws.uri, 'workspace');
		if (existing) {
			return existing;
		}

		// Use the workspace folder name as the label
		const item = this.getOrCreateItem(undefined, ws.name, ws.uri, 'workspace');
		item.canResolveChildren = true;
		return item;
	}

	// Retrieve or create an item for a Go package.
	private async getPackage(uri: Uri): Promise<TestItem | undefined> {
		let item: TestItem;

		const nested = getGoConfig(uri).get('testExplorer.packageDisplayMode') === 'nested';
		const modDirPath = await getModFolderPath(uri, true);
		const wsfolder = workspace.getWorkspaceFolder(uri);
		if (modDirPath) {
			const modDir = Uri.file(modDirPath); // TODO support non-file schemes
			// If the package is in a module, add it as a child of the module
			let parent = await this.getModule(modDir);
			if (uri.path === parent.uri?.path) {
				return parent;
			}

			if (nested) {
				const bits = parent.uri ? path.relative(parent.uri.fsPath, uri.fsPath).split(path.sep) : [];
				while (bits.length > 1) {
					if (!parent.uri?.path) continue;
					const dir = bits.shift();
					if (!dir) continue;
					const dirUri = uri.with({
						path: Uri.file(path.join(parent.uri.fsPath, dir)).path,
						query: '',
						fragment: ''
					});
					parent = this.getOrCreateItem(parent, dir, dirUri, 'package');
				}
			}

			const label =
				parent.uri && uri.path.startsWith(parent.uri.path)
					? uri.path.substring(parent.uri.path.length + 1)
					: uri.path;
			item = this.getOrCreateItem(parent, label, uri, 'package');
		} else if (wsfolder) {
			// If the package is in a workspace folder, add it as a child of the workspace
			const workspace = await this.getWorkspace(wsfolder);
			const existing = this.getItem(workspace, uri, 'package');
			if (existing) {
				return existing;
			}

			const label = uri.path.startsWith(wsfolder.uri.path)
				? uri.path.substring(wsfolder.uri.path.length + 1)
				: uri.path;
			item = this.getOrCreateItem(workspace, label, uri, 'package');
		} else {
			// Otherwise, add it directly to the root
			const existing = this.getItem(undefined, uri, 'package');
			if (existing) {
				return existing;
			}

			const srcPath = path.join(getCurrentGoPath(uri), 'src');
			const label = uri.path.startsWith(srcPath) ? uri.path.substring(srcPath.length + 1) : uri.path;
			item = this.getOrCreateItem(undefined, label, uri, 'package');
		}

		item.canResolveChildren = true;
		return item;
	}

	private getTestSuite(type: string): TestSuite {
		if (this.testSuites.has(type)) {
			return this.testSuites.get(type) as TestSuite;
		}

		const methods = new Set<TestItem>();
		const suite = { methods };
		this.testSuites.set(type, suite);
		return suite;
	}

	// Recursively process a Go AST symbol. If the symbol represents a test, fuzz test,
	// benchmark, or example function, a test item will be created for it, if one
	// does not already exist. If the symbol is not a function and contains
	// children, those children will be processed recursively.
	private async processSymbol(
		doc: TextDocument,
		file: TestItem,
		seen: Set<string>,
		importsTestify: boolean,
		symbol: DocumentSymbol
	) {
		// Skip TestMain(*testing.M) - allow TestMain(*testing.T)
		if (symbol.name === 'TestMain' && /\*testing.M\)/.test(symbol.detail)) {
			return;
		}

		// Recursively process symbols that are nested
		if (symbol.kind !== SymbolKind.Function && symbol.kind !== SymbolKind.Method) {
			for (const sym of symbol.children) await this.processSymbol(doc, file, seen, importsTestify, sym);
			return;
		}

		const match = symbol.name.match(testFuncRegex) || (importsTestify && symbol.name.match(testMethodRegex));
		if (!match) {
			return;
		}

		seen.add(symbol.name);

		const kind = match.groups?.kind.toLowerCase() as GoTestKind;
		const suite = match.groups?.type ? this.getTestSuite(match.groups.type) : undefined;
		const existing =
			this.getItem(file, doc.uri, kind, symbol.name) ||
			(suite?.func && this.getItem(suite?.func, doc.uri, kind, symbol.name));

		if (existing) {
			if (!existing.range?.isEqual(symbol.range)) {
				existing.range = symbol.range;
				this.relocateChildren(existing);
			}
			return existing;
		}

		const item = this.getOrCreateItem(
			suite?.func || file,
			match.groups?.name ?? '<none>',
			doc.uri,
			kind,
			symbol.name
		);
		item.range = symbol.range;

		if (suite) {
			this.isTestMethod.add(item);
			if (!suite.func) suite.methods.add(item);
			return;
		}

		if (!importsTestify) {
			return;
		}

		// Runs any suite
		const text = doc.getText(symbol.range);
		if (text.includes('suite.Run(')) {
			this.isTestSuiteFunc.add(item);
		}

		// Runs a specific suite
		// - suite.Run(t, new(MySuite))
		// - suite.Run(t, MySuite{})
		// - suite.Run(t, &MySuite{})
		const matchRunSuite = text.match(runTestSuiteRegex);
		if (matchRunSuite) {
			const g = matchRunSuite.groups;
			const suite = this.getTestSuite(g?.type1 || g?.type2 || '');
			suite.func = item;

			for (const method of suite.methods) {
				if (!method.parent || GoTest.parseId(method.parent.id).kind !== 'file') {
					continue;
				}

				method.parent.children.delete(method.id);
				item.children.add(method);
			}
		}
	}
}

// Walk the workspace, looking for Go modules. Returns a map indicating paths
// that are modules (value == true) and paths that are not modules but contain
// Go files (value == false).
async function walkWorkspaces(fs: FileSystem, uri: Uri): Promise<Map<string, boolean>> {
	const found = new Map<string, boolean>();
	await walk(fs, uri, async (dir, file, type) => {
		if (type !== FileType.File) {
			return;
		}

		if (file === 'go.mod') {
			// BUG(firelizard18): This does not create a separate entry for
			// modules within a module. Thus, tests in a module within another
			// module will appear under the top-level module's tree. This may or
			// may not be acceptable.
			found.set(dir.toString(), true);
			return WalkStop.Current;
		}

		if (file.endsWith('.go')) {
			found.set(dir.toString(), false);
		}
	});
	return found;
}

// Walk the workspace, calling the callback for any directory that contains a Go
// test file.
async function walkPackages(fs: FileSystem, uri: Uri, cb: (uri: Uri) => Promise<unknown>) {
	await walk(fs, uri, async (dir, file) => {
		if (file.endsWith('_test.go')) {
			await cb(dir);
			return WalkStop.Files;
		}
	});
}
