/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import path = require('path');
import {
	CancellationToken,
	EndOfLine,
	FileSystem,
	FileType,
	MarkdownString,
	Position,
	Range,
	TestController,
	TestItem,
	TestRun,
	TestRunRequest,
	TextDocument,
	TextLine,
	Uri,
	WorkspaceFolder
} from 'vscode';
import { TestExplorer } from '../../src/goTestExplorer';

export class MockTestItem<T = any> implements TestItem<T> {
	constructor(
		public id: string,
		public label: string,
		public parent: TestItem<any> | undefined,
		public uri: Uri | undefined,
		public data: T
	) {}

	canResolveChildren: boolean;
	busy: boolean;
	description?: string;
	range?: Range;
	error?: string | MarkdownString;
	runnable: boolean;
	debuggable: boolean;

	children = new Map<string, MockTestItem>();

	invalidate(): void {}

	dispose(): void {
		if (this.parent instanceof MockTestItem) {
			this.parent.children.delete(this.id);
		}
	}
}

export class MockTestController implements TestController<void> {
	root = new MockTestItem('Go', 'Go', void 0, void 0, void 0);

	resolveChildrenHandler?: (item: TestItem<void>) => void | Thenable<void>;
	runHandler?: (request: TestRunRequest<void>, token: CancellationToken) => void | Thenable<void>;

	createTestItem<TChild = any>(
		id: string,
		label: string,
		parent: TestItem<void>,
		uri?: Uri,
		data?: TChild
	): TestItem<TChild> {
		if (parent.children.has(id)) {
			throw new Error(`Test item ${id} already exists`);
		}
		const item = new MockTestItem<TChild>(id, label, parent, uri, data);
		(<MockTestItem>parent).children.set(id, item);
		return item;
	}

	createTestRun<T>(request: TestRunRequest<T>, name?: string, persist?: boolean): TestRun<T> {
		throw new Error('Method not implemented.');
	}

	dispose(): void {}
}

type DirEntry = [string, FileType];

export class MockTestFileSystem implements TestExplorer.FileSystem {
	constructor(public dirs: Map<string, DirEntry[]>, public files: Map<string, TextDocument>) {}

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

export class MockTestWorkspace implements TestExplorer.Workspace {
	static from(folders: string[], contents: Record<string, string | { contents: string; language: string }>) {
		const wsdirs: WorkspaceFolder[] = [];
		const dirs = new Map<string, DirEntry[]>();
		const files = new Map<string, TextDocument>();

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

			let doc: TextDocument;
			if (typeof entry === 'object') {
				doc = new MockTestDocument(uri, entry.contents, entry.language);
			} else if (path.basename(uri.path) === 'go.mod') {
				doc = new MockTestDocument(uri, entry, 'go.mod');
			} else {
				doc = new MockTestDocument(uri, entry);
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

export class MockTestDocument implements TextDocument {
	constructor(
		public uri: Uri,
		private contents: string,
		public languageId: string = 'go',
		public isUntitled: boolean = false,
		public isDirty: boolean = false
	) {}

	readonly version: number = 1;
	readonly eol: EndOfLine = EndOfLine.LF;

	get lineCount() {
		return this.contents.split('\n').length;
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
		return this.contents;
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
