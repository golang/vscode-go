/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();

	function showReleaseNotes() {
		vscode.postMessage({
			command: 'showReleaseNotes',
		});
	}

	document.querySelector(".release-notes").addEventListener('click', () => {
		showReleaseNotes();
	});

}());

