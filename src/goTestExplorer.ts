import {
	test,
	workspace,
	ExtensionContext,
	TestController,
	TestItem,
	TextDocument,
	Uri,
	DocumentSymbol,
	SymbolKind,
	FileType
} from 'vscode';
import path = require('path');
import { getModFolderPath } from './goModules';
import { getCurrentGoPath } from './util';
import { GoDocumentSymbolProvider } from './goOutline';

export function setupTestExplorer(context: ExtensionContext) {
	const ctrl = test.createTestController('go');
	context.subscriptions.push(ctrl);
	ctrl.root.label = 'Go';
	ctrl.root.canResolveChildren = true;
	ctrl.resolveChildrenHandler = (item) => resolveChildren(ctrl, item);

	context.subscriptions.push(
		workspace.onDidOpenTextDocument((e) => documentUpdate(ctrl, e).catch((err) => console.log(err)))
	);

	context.subscriptions.push(
		workspace.onDidChangeTextDocument((e) => documentUpdate(ctrl, e.document).catch((err) => console.log(err)))
	);
}

function testID(uri: Uri, kind: string, name?: string): string {
	uri = uri.with({ query: kind });
	if (name) uri = uri.with({ fragment: name });
	return uri.toString();
}

function getItem(parent: TestItem, uri: Uri, kind: string, name?: string): TestItem | undefined {
	return parent.children.get(testID(uri, kind, name));
}

function createItem(
	ctrl: TestController,
	parent: TestItem,
	label: string,
	uri: Uri,
	kind: string,
	name?: string
): TestItem {
	const id = testID(uri, kind, name);
	const existing = parent.children.get(id);
	if (existing) {
		return existing;
	}

	console.log(`Creating ${id}`);
	return ctrl.createTestItem(id, label, parent, uri);
}

function removeIfEmpty(item: TestItem) {
	// Don't dispose of the root
	if (!item.parent) {
		return;
	}

	// Don't dispose of empty modules
	const uri = Uri.parse(item.id);
	if (uri.query == 'module') {
		return;
	}

	if (item.children.size) {
		return;
	}

	item.dispose();
	removeIfEmpty(item.parent);
}

async function getModule(ctrl: TestController, uri: Uri): Promise<TestItem> {
	const existing = getItem(ctrl.root, uri, 'module');
	if (existing) {
		return existing;
	}

	// Use the module name as the label
	const goMod = Uri.joinPath(uri, 'go.mod');
	const contents = await workspace.fs.readFile(goMod);
	const modLine = contents.toString().split('\n', 2)[0];
	const match = modLine.match(/^module (?<name>.*?)(?:\s|\/\/|$)/);
	const item = createItem(ctrl, ctrl.root, match.groups.name, uri, 'module');
	item.canResolveChildren = true;
	return item;
}

async function getPackage(ctrl: TestController, uri: Uri): Promise<TestItem> {
	// If the package is not in a module, add it as a child of the root
	const modDir = await getModFolderPath(uri, true);
	if (!modDir) {
		const existing = getItem(ctrl.root, uri, 'package');
		if (existing) {
			return existing;
		}

		const srcPath = path.join(getCurrentGoPath(uri), 'src');
		const label = uri.path.startsWith(srcPath) ? uri.path.substring(srcPath.length + 1) : uri.path;
		const item = createItem(ctrl, ctrl.root, label, uri, 'package');
		item.canResolveChildren = true;
		return item;
	}

	// Otherwise, add it as a child of the module
	const modUri = uri.with({ path: modDir });
	const module = await getModule(ctrl, modUri);
	const existing = getItem(module, uri, 'package');
	if (existing) {
		return existing;
	}

	const label = uri.path.startsWith(modUri.path) ? uri.path.substring(modUri.path.length + 1) : uri.path;
	const item = createItem(ctrl, module, label, uri, 'package');
	item.canResolveChildren = true;
	return item;
}

async function getFile(ctrl: TestController, uri: Uri): Promise<TestItem> {
	const dir = path.dirname(uri.path);
	const pkg = await getPackage(ctrl, uri.with({ path: dir }));
	const existing = getItem(pkg, uri, 'file');
	if (existing) {
		return existing;
	}

	const label = path.basename(uri.path);
	const item = createItem(ctrl, pkg, label, uri, 'file');
	item.canResolveChildren = true;
	return item;
}

async function processSymbol(
	ctrl: TestController,
	uri: Uri,
	file: TestItem,
	seen: Set<string>,
	symbol: DocumentSymbol
) {
	// Skip TestMain(*testing.M)
	if (symbol.name === 'TestMain' || /\*testing.M\)/.test(symbol.detail)) {
		return;
	}

	// Recursively process symbols that are nested
	if (symbol.kind !== SymbolKind.Function) {
		for (const sym of symbol.children) await processSymbol(ctrl, uri, file, seen, sym);
		return;
	}

	const match = symbol.name.match(/^(?<type>Test|Example|Benchmark)/);
	if (!match) {
		return;
	}

	seen.add(symbol.name);

	const kind = match.groups.type.toLowerCase();
	const existing = getItem(file, uri, kind, symbol.name);
	if (existing) {
		return existing;
	}

	const item = createItem(ctrl, file, symbol.name, uri, kind, symbol.name);
	item.range = symbol.range;
	item.runnable = true;
	item.debuggable = true;
}

async function loadFileTests(ctrl: TestController, doc: TextDocument) {
	const seen = new Set<string>();
	const item = await getFile(ctrl, doc.uri);
	const symbols = await new GoDocumentSymbolProvider().provideDocumentSymbols(doc, null);
	for (const symbol of symbols) await processSymbol(ctrl, doc.uri, item, seen, symbol);

	for (const child of item.children.values()) {
		const uri = Uri.parse(child.id);
		if (!seen.has(uri.fragment)) {
			child.dispose();
		}
	}

	removeIfEmpty(item);
}

async function containsGoFiles(uri: Uri): Promise<boolean> {
	for (const [file, type] of await workspace.fs.readDirectory(uri)) {
		if (file.startsWith('.')) {
			continue;
		}

		switch (type) {
			case FileType.File:
				if (file.endsWith('.go')) {
					return true;
				}
				break;

			case FileType.Directory:
				if (await containsGoFiles(Uri.joinPath(uri, file))) {
					return true;
				}
				break;
		}
	}
}

async function walkPackages(uri: Uri, cb: (uri: Uri) => Promise<any>) {
	let called = false;
	for (const [file, type] of await workspace.fs.readDirectory(uri)) {
		if (file.startsWith('.')) {
			continue;
		}

		switch (type) {
			case FileType.File:
				if (!called && file.endsWith('_test.go')) {
					called = true;
					await cb(uri);
				}
				break;

			case FileType.Directory:
				await walkPackages(Uri.joinPath(uri, file), cb);
				break;
		}
	}
}

async function resolveChildren(ctrl: TestController, item: TestItem) {
	if (!item.parent) {
		for (const folder of workspace.workspaceFolders || []) {
			if (await containsGoFiles(folder.uri)) {
				await getModule(ctrl, folder.uri);
			}
		}
		return;
	}

	const uri = Uri.parse(item.id);
	switch (uri.query) {
		case 'module':
			await walkPackages(uri, (uri) => getPackage(ctrl, uri));
			break;

		case 'package':
			for (const [file, type] of await workspace.fs.readDirectory(uri)) {
				if (type !== FileType.File || !file.endsWith('_test.go')) {
					continue;
				}

				await getFile(ctrl, Uri.joinPath(uri, file));
			}
			break;

		case 'file':
			const doc = await workspace.openTextDocument(uri);
			await loadFileTests(ctrl, doc);
			break;
	}
}

async function documentUpdate(ctrl: TestController, doc: TextDocument) {
	if (!doc.uri.path.endsWith('_test.go')) {
		return;
	}

	if (doc.uri.scheme === 'git') {
		// TODO(firelizzard18): When a workspace is reopened, VSCode passes us git: URIs. Why?
		return;
	}

	await loadFileTests(ctrl, doc);
}
