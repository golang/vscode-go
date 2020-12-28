/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This code is modified from:
// https://github.com/microsoft/vscode-extension-samples/tree/master/webview-sample

import vscode = require('vscode');

export class WelcomePanel {
	public static currentPanel: WelcomePanel | undefined;

	public static readonly viewType = 'welcomeGo';

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (WelcomePanel.currentPanel) {
			WelcomePanel.currentPanel.panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			WelcomePanel.viewType,
			'Go - Welcome',
			column || vscode.ViewColumn.One,
			{
				// Enable javascript in the webview
				enableScripts: true,

				// And restrict the webview to only loading content from our extension's directory.
				localResourceRoots: [vscode.Uri.joinPath(extensionUri)],
			}
		);
		panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'go-logo-blue.png');

		WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
	}

	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private readonly dataroot: vscode.Uri;
	private disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.dataroot = vscode.Uri.joinPath(this.extensionUri, 'media');

		// Set the webview's initial html content
		this.update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Handle messages from the webview
		this.panel.webview.onDidReceiveMessage(
			(message) => {
				console.log(message);
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
					case 'showReleaseNotes':
						const uri = vscode.Uri.joinPath(this.extensionUri, 'CHANGELOG.md');
						vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
						return;
				}
			},
			null,
			this.disposables
		);
	}

	public dispose() {
		WelcomePanel.currentPanel = undefined;

		// Clean up our resources
		this.panel.dispose();

		while (this.disposables.length) {
			const x = this.disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private update() {
		const webview = this.panel.webview;
		this.panel.webview.html = this.getHtmlForWebview(webview);
	}

	private getHtmlForWebview(webview: vscode.Webview) {
		// Local path to css styles and images
		const scriptPathOnDisk = vscode.Uri.joinPath(this.dataroot, 'welcome.js');
		const stylePath = vscode.Uri.joinPath(this.dataroot, 'welcome.css');
		const gopherPath = vscode.Uri.joinPath(this.dataroot, 'go-logo-blue.png');

		// Uri to load styles and images into webview
		const scriptURI = webview.asWebviewUri(scriptPathOnDisk);
		const stylesURI = webview.asWebviewUri(stylePath);
		const gopherURI = webview.asWebviewUri(gopherPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${stylesURI}" rel="stylesheet">

				<title>Go - Welcome</title>
			</head>
			<body>
			<div class="header">
				<img src="${gopherURI}" alt="logo"/>
				<h1>Go - Welcome</h1>
			</div>

			<p>Rich Go language support for Visual Studio Code</p>
			<!-- linking to a document does not actually work, but is used here to give it the appearance
			of a link -->
			<p><a class="release-notes"">Release Notes</a></p>

			<script nonce="${nonce}" src="${scriptURI}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
