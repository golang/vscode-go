/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import * as vscode from 'vscode';
import { FileSystem } from './utils';

// Reasons to stop walking, used by walk
export enum WalkStop {
	None = 0, // Don't stop
	Abort, // Abort the walk
	Current, // Stop walking the current directory
	Files, // Skip remaining files
	Directories // Skip remaining directories
}

// Recursively walk a directory, breadth first.
export async function walk(
	fs: FileSystem,
	uri: vscode.Uri,
	cb: (dir: vscode.Uri, file: string, type: vscode.FileType) => Promise<WalkStop | undefined>
): Promise<void> {
	let dirs = [uri];

	// While there are directories to be scanned
	while (dirs.length > 0) {
		const d = dirs;
		dirs = [];

		outer: for (const uri of d) {
			const dirs2 = [];
			let skipFiles = false,
				skipDirs = false;

			// Scan the directory
			inner: for (const [file, type] of await fs.readDirectory(uri)) {
				if ((skipFiles && type === vscode.FileType.File) || (skipDirs && type === vscode.FileType.Directory)) {
					continue;
				}

				// Ignore all dotfiles
				if (file.startsWith('.')) {
					continue;
				}

				if (type === vscode.FileType.Directory) {
					dirs2.push(vscode.Uri.joinPath(uri, file));
				}

				const s = await cb(uri, file, type);
				switch (s) {
					case WalkStop.Abort:
						// Immediately abort the entire walk
						return;

					case WalkStop.Current:
						// Immediately abort the current directory
						continue outer;

					case WalkStop.Files:
						// Skip all subsequent files in the current directory
						skipFiles = true;
						if (skipFiles && skipDirs) {
							break inner;
						}
						break;

					case WalkStop.Directories:
						// Skip all subsequent directories in the current directory
						skipDirs = true;
						if (skipFiles && skipDirs) {
							break inner;
						}
						break;
				}
			}

			// Add subdirectories to the recursion list
			dirs.push(...dirs2);
		}
	}
}
