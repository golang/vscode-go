/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import * as vscode from 'vscode';

export class GoTest {
	// Construct an ID for an item. Exported for tests.
	// - Module:    file:///path/to/mod?module
	// - Package:   file:///path/to/mod/pkg?package
	// - File:      file:///path/to/mod/file.go?file
	// - Test:      file:///path/to/mod/file.go?test#TestXxx
	// - Benchmark: file:///path/to/mod/file.go?benchmark#BenchmarkXxx
	// - Example:   file:///path/to/mod/file.go?example#ExampleXxx
	static id(uri: vscode.Uri, kind: string, name?: string): string {
		uri = uri.with({ query: kind });
		if (name) uri = uri.with({ fragment: name });
		return uri.toString();
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
	const uri = vscode.Uri.parse(item.id);
	if (uri.query === 'module' || uri.query === 'workspace' || (uri.query === 'package' && !item.parent)) {
		return;
	}

	if (item.children.size > 0) {
		return;
	}

	dispose(item);
	disposeIfEmpty(item.parent);
}
