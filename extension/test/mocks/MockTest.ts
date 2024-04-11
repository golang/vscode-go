/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import path = require('path');
import {
	CancellationToken,
	EndOfLine,
	FileCoverage,
	FileType,
	MarkdownString,
	Position,
	Range,
	TestController,
	TestItem,
	TestItemCollection,
	TestMessage,
	TestRun,
	TestRunProfile,
	TestRunProfileKind,
	TestRunRequest,
	TestTag,
	TextDocument,
	TextLine,
	Uri,
	WorkspaceFolder,
	EventEmitter
} from 'vscode';
import { FileSystem, Workspace } from '../../src/goTest/utils';

type TestRunHandler = (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void;

class MockTestCollection implements TestItemCollection {
	constructor(private item: MockTestItem | MockTestController) {}

	[Symbol.iterator](): Iterator<[id: string, testItem: TestItem], any, undefined> {
		throw new Error('Method not implemented.');
	}

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

	get(id: string): TestItem | undefined {
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
	tags: readonly TestTag[] = [];
	sortText?: string | undefined;

	parent: TestItem | undefined;
	canResolveChildren = false;
	busy = false;
	description?: string;
	range: Range | undefined;
	error: string | MarkdownString | undefined;
	runnable = false;
	debuggable = false;

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
	) {}
	tag: TestTag | undefined;
	isDefault = false;
	onDidChangeDefault = new EventEmitter<boolean>().event;
	supportsContinuousRun= false;

	configureHandler(): void {}
	dispose(): void {}
}

class MockTestRun implements TestRun {
	name = 'test run';
	isPersisted = false;
	onDidDispose = new EventEmitter<void>().event;

	get token(): CancellationToken {
		throw new Error('Method not implemented.');
	}

	enqueued(test: TestItem): void {}
	started(test: TestItem): void {}
	skipped(test: TestItem): void {}
	failed(test: TestItem, message: TestMessage | readonly TestMessage[], duration?: number): void {}
	errored(test: TestItem, message: TestMessage | readonly TestMessage[], duration?: number): void {}
	passed(test: TestItem, duration?: number): void {}
	appendOutput(output: string): void {}
	addCoverage(fileCoverage: FileCoverage): void {}
	end(): void {}
}

export class MockTestController implements TestController {
	id = 'go';
	label = 'Go';
	items = new MockTestCollection(this);

	resolveHandler?: (item: TestItem | undefined) => void | Thenable<void>;
	refreshHandler: ((token: CancellationToken) => void | Thenable<void>) | undefined;

	createTestRun(request: TestRunRequest, name?: string, persist?: boolean): TestRun {
		return new MockTestRun();
	}

	createRunProfile(
		label: string,
		kind: TestRunProfileKind,
		runHandler: TestRunHandler,
	): TestRunProfile {
		return new MockTestRunProfile(label, kind, runHandler);
	}

	createTestItem(id: string, label: string, uri?: Uri): TestItem {
		return new MockTestItem(id, label, uri, this);
	}

	dispose(): void {}
	invalidateTestResults(items?: TestItem | readonly TestItem[]): void {}
}

type DirEntry = [string, FileType];

class MockTestFileSystem implements FileSystem {
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

export class MockTestWorkspace implements Workspace {
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
				dirs.get(dir.toString())?.push(entry);
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
		const doc = this.fs.files.get(uri.toString());
		if (!doc) throw Error('doc not found');
		return Promise.resolve(doc);
	}

	getWorkspaceFolder(uri: Uri): WorkspaceFolder {
		return this.workspaceFolders.filter((x) => x.uri === uri)[0];
	}

	textDocuments: TextDocument[] = [];
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
