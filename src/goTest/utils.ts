/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import * as vscode from 'vscode';

// GoTestKind indicates the Go construct represented by a test item.
//
// - A 'module' is a folder that contains a go.mod file
// - A 'workspace' is a VSCode workspace folder that contains .go files outside
//   of a module
// - A 'package' is a folder that contains .go files (and is not a module)
// - A 'file' is a file ending with _test.go
// - A 'test' is a Go test, e.g. func TestXxx(t *testing.T)
// - A 'benchmark' is a Go benchmark, e.g. func BenchmarkXxx(t *testing.T)
// - An 'example' is a Go example, e.g. func ExampleXxx()
//
// The top-level test item for a workspace folder is always either a module or a
// workspace. If the user opens a file (containing tests) that is not contained
// within any workspace folder, a top-level package will be created as a parent
// of that file.
export type GoTestKind = 'module' | 'workspace' | 'package' | 'file' | 'test' | 'benchmark' | 'example';

export class GoTest {
	// Constructs an ID for an item. The ID of a test item consists of the URI
	// for the relevant file or folder with the URI query set to the test item
	// kind (see GoTestKind) and the URI fragment set to the function name, if
	// the item represents a test, benchmark, or example function.
	//
	// - Module:    file:///path/to/mod?module
	// - Workspace: file:///path/to/src?workspace
	// - Package:   file:///path/to/mod/pkg?package
	// - File:      file:///path/to/mod/file.go?file
	// - Test:      file:///path/to/mod/file.go?test#TestXxx
	// - Benchmark: file:///path/to/mod/file.go?benchmark#BenchmarkXxx
	// - Example:   file:///path/to/mod/file.go?example#ExampleXxx
	static id(uri: vscode.Uri, kind: GoTestKind, name?: string): string {
		uri = uri.with({ query: kind });
		if (name) uri = uri.with({ fragment: encodeURIComponent(name) });
		return uri.toString();
	}

	// Parses the ID as a URI and extracts the kind and name.
	//
	// The URI of the relevant file or folder should be retrieved wil
	// TestItem.uri.
	static parseId(id: string): { kind: GoTestKind; name?: string } {
		const u = vscode.Uri.parse(id);
		const kind = u.query as GoTestKind;
		const name = decodeURIComponent(u.fragment);
		return { name, kind };
	}
}

// The subset of vscode.FileSystem that is used by the test explorer.
export type FileSystem = Pick<vscode.FileSystem, 'readFile' | 'readDirectory'>;

// The subset of vscode.workspace that is used by the test explorer.
export interface Workspace
	extends Pick<typeof vscode.workspace, 'workspaceFolders' | 'getWorkspaceFolder' | 'textDocuments'> {
	// use custom FS type
	readonly fs: FileSystem;

	// only include one overload
	openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument>;
}

export function findItem(
	items: vscode.TestItemCollection,
	fn: (item: vscode.TestItem) => vscode.TestItem | undefined
): vscode.TestItem | undefined {
	let found: vscode.TestItem | undefined;
	items.forEach((item) => {
		if (found) return;
		found = fn(item);
	});
	return found;
}

export function forEachAsync<T>(
	items: vscode.TestItemCollection,
	fn: (item: vscode.TestItem) => Promise<T>
): Promise<T[]> {
	const promises: Promise<T>[] = [];
	items.forEach((item) => promises.push(fn(item)));
	return Promise.all(promises);
}

export function dispose(item: vscode.TestItem) {
	item.parent.children.delete(item.id);
}

// Dispose of the item if it has no children, recursively. This facilitates
// cleaning up package/file trees that contain no tests.
export function disposeIfEmpty(item: vscode.TestItem) {
	// Don't dispose of empty top-level items
	const { kind } = GoTest.parseId(item.id);
	if (kind === 'module' || kind === 'workspace' || (kind === 'package' && !item.parent)) {
		return;
	}

	if (item.children.size > 0) {
		return;
	}

	dispose(item);
	disposeIfEmpty(item.parent);
}
