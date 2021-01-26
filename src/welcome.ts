/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This code is modified from:
// https://github.com/microsoft/vscode-extension-samples/tree/master/webview-sample

import vscode = require('vscode');
import { getGoConfig } from './config';
import { extensionId } from './const';

export class WelcomePanel {
	public static currentPanel: WelcomePanel | undefined;

	public static readonly viewType = 'welcomeGo';

	public static createOrShow(extensionUri: vscode.Uri, ) {
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
			'Go for VS Code',
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
					case 'openDocument':
						const uri = vscode.Uri.joinPath(this.extensionUri, message.document);
						vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
						return;
					case 'openSetting':
						vscode.commands.executeCommand('workbench.action.openSettings', message.setting);
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
		const announcePath = vscode.Uri.joinPath(this.dataroot, 'announce.png');
		const goExtension = vscode.extensions.getExtension(extensionId)!;
		const goExtensionVersion = goExtension.packageJSON.version;

		// Uri to load styles and images into webview
		const scriptURI = webview.asWebviewUri(scriptPathOnDisk);
		const stylesURI = webview.asWebviewUri(stylePath);
		const gopherURI = webview.asWebviewUri(gopherPath);
		const announceURI = webview.asWebviewUri(announcePath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		// Add an extra note if the user has already disabled gopls, asking
		// them to enable it.
		let alreadyDisabledGopls = '';
		if (getGoConfig()?.get('useLanguageServer') === false) {
			alreadyDisabledGopls = `If you previously disabled gopls through the "go.useLanguageServer"
setting, we recommend removing that setting now.`;
		}

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
				<title>Go for VS Code</title>
			</head>
			<body>
			<main class="Content">
			<div class="Header">
				<img src="${gopherURI}" alt="Go Logo" class="Header-logo"/>
				<div class="Header-details">
					<h1 class="Header-title">Go for VS Code v${goExtensionVersion}</h1>
					<p>The official Go extension for Visual Studio Code, providing rich language support for Go projects.</p>
					<ul class="Header-links">
						<!--
							Here and elsewhere, we must use a fake anchor for command buttons, to get styling
							consistent with links. We can't fake this using CSS, as it conflicts with theming.
						-->
						<li><a href="#" class="Command" data-command="openDocument" data-document="CHANGELOG.md">Release notes</a></li>
						<li><a href="https://github.com/golang/vscode-go">GitHub</a></li>
						<li><a href="https://invite.slack.golangbridge.org/">Slack</a></li>
					</ul>
				</div>
			</div>

			<div class="Announcement">
				<img src="${announceURI}" alt="announce" class="Announcement-image" />
				<p>
					Heads up! Gopls, the official Go language server, is now enabled in VS Code by default.
					Gopls replaces several legacy tools to provide IDE features while editing Go code.
					See <a href="https://github.com/golang/vscode-go/issues/1037">issue 1037</a> for more
					information. ${alreadyDisabledGopls}
				</p>
			</div>

			<div class="Cards">
				<div class="Card">
					<div class="Card-inner">
						<p class="Card-title">Getting started</p>
						<p class="Card-content">Learn about the Go extension in our
							<a href="https://github.com/golang/vscode-go/blob/master/README.md">README</a>.
						</p>
					</div>
				</div>

				<div class="Card">
					<div class="Card-inner">
						<p class="Card-title">Learning Go</p>
						<p class="Card-content">If you're new to the Go programming language,
							<a href="https://learn.go.dev">learn.go.dev</a> is a great place to get started.</a>
						</p>
					</div>
				</div>

				<div class="Card">
					<div class="Card-inner">
						<p class="Card-title">Troubleshooting</p>
						<p class="Card-content">Experiencing problems? Start with our
							<a href="https://github.com/golang/vscode-go/blob/master/docs/troubleshooting.md">troubleshooting guide</a>.  </p> </div>
				</div>
			</div>
			</main>

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
