/* eslint-disable no-case-declarations */
/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This code is modified from:
// https://github.com/microsoft/vscode-extension-samples/tree/master/webview-sample

import vscode = require('vscode');
import path = require('path');
import semver = require('semver');
import { extensionId } from './const';
import { GoExtensionContext } from './context';
import { extensionInfo, getGoConfig } from './config';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { createRegisterCommand } from './commands';

export class WelcomePanel {
	public static activate(ctx: vscode.ExtensionContext, goCtx: GoExtensionContext) {
		const registerCommand = createRegisterCommand(ctx, goCtx);
		registerCommand('go.welcome', WelcomePanel.createOrShow);

		if (vscode.window.registerWebviewPanelSerializer) {
			// Make sure we register a serializer in activation event
			vscode.window.registerWebviewPanelSerializer(WelcomePanel.viewType, {
				async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
					WelcomePanel.revive(webviewPanel, ctx.extensionUri);
				}
			});
		}
		showGoWelcomePage();
	}

	public static currentPanel: WelcomePanel | undefined;

	public static readonly viewType = 'welcomeGo';

	public static createOrShow(ctx: Pick<vscode.ExtensionContext, 'extensionUri'>) {
		return () => {
			const extensionUri = ctx.extensionUri;
			const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

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
					localResourceRoots: [joinPath(extensionUri)]
				}
			);
			panel.iconPath = joinPath(extensionUri, 'media', 'go-logo-blue.png');

			WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
		};
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
	}

	public readonly dataroot: vscode.Uri; // exported for testing.
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.dataroot = joinPath(this.extensionUri, 'media');

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
						const uri = joinPath(this.extensionUri, message.document);
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
		const scriptPathOnDisk = joinPath(this.dataroot, 'welcome.js');
		const stylePath = joinPath(this.dataroot, 'welcome.css');
		const gopherPath = joinPath(this.dataroot, 'go-logo-blue.png');
		const goExtension = vscode.extensions.getExtension(extensionId)!;
		const goExtensionVersion = goExtension.packageJSON.version;

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
						<li><a href="https://stackoverflow.com/questions/tagged/go+visual-studio-code">Questions</a></li>
<li><a href="https://invite.slack.golangbridge.org/">Slack</a></li>
					</ul>
				</div>
			</div>

			<div class="Announcement">
				<p>📣 Recent gopls release (v0.14) includes <a href="https://go.dev/issue/58894">opt-in transparent telemetry</a>.
				</p>
				<p><b>Telemetry uploading is off by default</b> even when Visual Studio Code's telemetry setting is enabled.
				Go Telemetry needs to be enabled with the following command:
				<br>
				<code>go run golang.org/x/telemetry/cmd/gotelemetry@latest on</code>
				</p>
				<p>
				After telemetry is enabled, metrics and crash stack traces will be uploaded to <a href="https://telemetry.go.dev">telemetry.go.dev</a> weekly.
				You can see the preview of the collected data using:
				<br>
				<code>go run golang.org/x/telemetry/cmd/gotelemetry@latest view</code>
				</p>
				<p>
				If we get enough adoption, this data can significantly advance the pace of the go plugin development and help us meet a higher standard of reliability.
                Go telemetry is designed to be transparent and privacy-preserving. Learn more at <a href="https://go.dev/doc/telemetry">https://go.dev/doc/telemetry</a>.
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
							<a href="https://go.dev/learn">go.dev/learn</a> is a great place to get started.</a>
						</p>
					</div>
				</div>

				<div class="Card">
					<div class="Card-inner">
						<p class="Card-title">Troubleshooting</p>
						<p class="Card-content">Experiencing problems? Start with our
							<a href="https://github.com/golang/vscode-go/wiki/troubleshooting">troubleshooting guide</a>.  </p> </div>
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

function joinPath(uri: vscode.Uri, ...pathFragment: string[]): vscode.Uri {
	// Reimplementation of
	// https://github.com/microsoft/vscode/blob/b251bd952b84a3bdf68dad0141c37137dac55d64/src/vs/base/common/uri.ts#L346-L357
	// with Node.JS path. This is a temporary workaround for https://github.com/eclipse-theia/theia/issues/8752.
	if (!uri.path) {
		throw new Error('[UriError]: cannot call joinPaths on URI without path');
	}
	return uri.with({ path: vscode.Uri.file(path.join(uri.fsPath, ...pathFragment)).path });
}

function showGoWelcomePage() {
	// Update this list of versions when there is a new version where we want to
	// show the welcome page on update.
	const showVersions: string[] = ['0.40.0'];
	// TODO(hyangah): use the content hash instead of hard-coded string.
	// https://github.com/golang/vscode-go/issue/1179
	let goExtensionVersion = '0.40.0';
	let goExtensionVersionKey = 'go.extensionVersion';
	if (extensionInfo.isPreview) {
		goExtensionVersion = '0.0.0';
		goExtensionVersionKey = 'go.nightlyExtensionVersion';
	}

	const savedGoExtensionVersion = getFromGlobalState(goExtensionVersionKey, '');

	if (shouldShowGoWelcomePage(showVersions, goExtensionVersion, savedGoExtensionVersion)) {
		vscode.commands.executeCommand('go.welcome');
	}
	if (goExtensionVersion !== savedGoExtensionVersion) {
		updateGlobalState(goExtensionVersionKey, goExtensionVersion);
	}
}

export function shouldShowGoWelcomePage(showVersions: string[], newVersion: string, oldVersion: string): boolean {
	if (!extensionInfo.isInCloudIDE && getGoConfig().get('showWelcome') === false) {
		return false;
	}
	if (newVersion === oldVersion) {
		return false;
	}
	const coercedNew = semver.coerce(newVersion);
	const coercedOld = semver.coerce(oldVersion);
	if (!coercedNew || !coercedOld) {
		return true;
	}
	// Both semver.coerce(0.22.0) and semver.coerce(0.22.0-rc.1) will be 0.22.0.
	return semver.gte(coercedNew, coercedOld) && showVersions.includes(coercedNew.toString());
}
