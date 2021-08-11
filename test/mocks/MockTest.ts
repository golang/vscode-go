/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import path = require('path');
import {
	CancellationToken,
	EndOfLine,
	FileType,
	MarkdownString,
	Position,
	Range,
	TestController,
	TestItem,
	TestItemCollection,
	TestRun,
	TestRunProfile,
	TestRunProfileKind,
	TestRunRequest,
	TextDocument,
	TextLine,
	Uri,
	WorkspaceFolder
} from 'vscode';
import { TestExplorer } from '../../src/goTestExplorer';

type TestRunHandler = (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void;

class MockTestCollection implements TestItemCollection {
	constructor(private item: MockTestItem | MockTestController) {}

	private readonly m = new Map<string, MockTestItem>();

	get size() {
		return this.m.size;
	}

	forEach(fn: (item: TestItem, coll: TestItemCollection) => unknown) {
		for (const item of this.m.values()) fn(item, this);
	}

	add(item: TestItem): void {
		if (this.m.has(item.id)) {
			throw new Error(`Test item ${item.id} already exists`);
		}

		if (!(item instanceof MockTestItem)) {
			throw new Error('not a mock');
		} else if (this.item instanceof MockTestItem) {
			item.parent = this.item;
		}

		this.m.set(item.id, item);
	}

	delete(id: string): void {
		this.m.delete(id);
	}

	get(id: string): TestItem {
		return this.m.get(id);
	}

	replace(items: readonly TestItem[]): void {
		throw new Error('not impelemented');
	}
}

class MockTestItem implements TestItem {
	private static idNum = 0;
	private idNum: number;

	constructor(public id: string, public label: string, public uri: Uri | undefined, public ctrl: MockTestController) {
		this.idNum = MockTestItem.idNum;
		MockTestItem.idNum++;
	}

	parent: TestItem | undefined;
	canResolveChildren: boolean;
	busy: boolean;
	description?: string;
	range?: Range;
	error?: string | MarkdownString;
	runnable: boolean;
	debuggable: boolean;

	children: MockTestCollection = new MockTestCollection(this);

	invalidateResults(): void {}

	dispose(): void {
		if (this.parent instanceof MockTestItem) {
			this.parent.children.delete(this.id);
		}
	}
}

class MockTestRunProfile implements TestRunProfile {
	constructor(
		public label: string,
		public kind: TestRunProfileKind,
		public runHandler: TestRunHandler,
		public isDefault: boolean
	) {}

	configureHandler?: () => void;
	dispose(): void {}
}

export class MockTestController implements TestController {
	id = 'go';
	label = 'Go';
	items = new MockTestCollection(this);

	resolveHandler?: (item: TestItem) => void | Thenable<void>;

	createTestRun(request: TestRunRequest, name?: string, persist?: boolean): TestRun {
		throw new Error('Method not implemented.');
	}

	createRunProfile(
		label: string,
		kind: TestRunProfileKind,
		runHandler: TestRunHandler,
		isDefault?: boolean
	): TestRunProfile {
		return new MockTestRunProfile(label, kind, runHandler, isDefault);
	}

	createTestItem(id: string, label: string, uri?: Uri): TestItem {
		return new MockTestItem(id, label, uri, this);
	}

	dispose(): void {}
}

type DirEntry = [string, FileType];

class MockTestFileSystem implements TestExplorer.FileSystem {
	constructor(public dirs: Map<string, DirEntry[]>, public files: Map<string, MockTestDocument>) {}

	readDirectory(uri: Uri): Thenable<[string, FileType][]> {
		const k = uri.with({ query: '', fragment: '' }).toString();
		return Promise.resolve(this.dirs.get(k) || []);
	}

	readFile(uri: Uri): Thenable<Uint8Array> {
		const k = uri.with({ query: '', fragment: '' }).toString();
		const s = this.files.get(k)?.getText();
		return Promise.resolve(Buffer.from(s || ''));
	}
}

function unindent(s: string): string {
	let lines = s.split('\n');
	if (/^\s*$/.test(lines[0])) lines = lines.slice(1);

	const m = lines[0].match(/^\s+/);
	if (!m) return s;
	if (!lines.every((l) => /^\s*$/.test(l) || l.startsWith(m[0]))) return s;

	for (const i in lines) {
		lines[i] = lines[i].substring(m[0].length);
	}
	return lines.join('\n');
}

export class MockTestWorkspace implements TestExplorer.Workspace {
	static from(folders: string[], contents: Record<string, string | { contents: string; language: string }>) {
		const wsdirs: WorkspaceFolder[] = [];
		const dirs = new Map<string, DirEntry[]>();
		const files = new Map<string, MockTestDocument>();

		for (const i in folders) {
			const uri = Uri.parse(folders[i]);
			wsdirs.push({ uri, index: Number(i), name: path.basename(uri.path) });
		}

		function push(uri: Uri, child: FileType) {
			const entry: DirEntry = [path.basename(uri.path), child];
			const dir = uri.with({ path: path.dirname(uri.path) });
			if (dirs.has(dir.toString())) {
				dirs.get(dir.toString()).push(entry);
				return;
			}

			if (path.dirname(dir.path) !== dir.path) {
				push(dir, FileType.Directory);
			}
			dirs.set(dir.toString(), [entry]);
		}

		for (const k in contents) {
			const uri = Uri.parse(k);
			const entry = contents[k];

			let doc: MockTestDocument;
			if (typeof entry === 'object') {
				doc = new MockTestDocument(uri, unindent(entry.contents), entry.language);
			} else if (path.basename(uri.path) === 'go.mod') {
				doc = new MockTestDocument(uri, unindent(entry), 'go.mod');
			} else {
				doc = new MockTestDocument(uri, unindent(entry));
			}

			files.set(uri.toString(), doc);
			push(uri, FileType.File);
		}

		return new this(wsdirs, new MockTestFileSystem(dirs, files));
	}

	constructor(public workspaceFolders: WorkspaceFolder[], public fs: MockTestFileSystem) {}

	openTextDocument(uri: Uri): Thenable<TextDocument> {
		return Promise.resolve(this.fs.files.get(uri.toString()));
	}

	getWorkspaceFolder(uri: Uri): WorkspaceFolder {
		return this.workspaceFolders.filter((x) => x.uri === uri)[0];
	}
}

class MockTestDocument implements TextDocument {
	constructor(
		public uri: Uri,
		private _contents: string,
		public languageId: string = 'go',
		public isUntitled: boolean = false,
		public isDirty: boolean = false
	) {}

	set contents(s: string) {
		this._contents = s;
	}

	readonly version: number = 1;
	readonly eol: EndOfLine = EndOfLine.LF;

	get lineCount() {
		return this._contents.split('\n').length;
	}

	get fileName() {
		return path.basename(this.uri.path);
	}

	save(): Thenable<boolean> {
		if (!this.isDirty) {
			return Promise.resolve(false);
		}

		this.isDirty = false;
		return Promise.resolve(true);
	}

	get isClosed(): boolean {
		throw new Error('Method not implemented.');
	}

	lineAt(line: number): TextLine;
	lineAt(position: Position): TextLine;
	lineAt(position: any): TextLine {
		throw new Error('Method not implemented.');
	}

	offsetAt(position: Position): number {
		throw new Error('Method not implemented.');
	}

	positionAt(offset: number): Position {
		throw new Error('Method not implemented.');
	}

	getText(range?: Range): string {
		if (range) {
			throw new Error('Method not implemented.');
		}
		return this._contents;
	}

	getWordRangeAtPosition(position: Position, regex?: RegExp): Range {
		throw new Error('Method not implemented.');
	}

	validateRange(range: Range): Range {
		throw new Error('Method not implemented.');
	}

	validatePosition(position: Position): Position {
		throw new Error('Method not implemented.');
	}
}
