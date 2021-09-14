/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import { exec } from 'child_process';
import { window, CancellationToken, TextDocumentContentProvider, Uri } from 'vscode';
import { outputChannel } from './goStatus';
import { getBinPath } from './util';

export class ProfileDocumentContentProvider implements TextDocumentContentProvider {
	provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string | undefined> {
		return this.pprof(uri, token);
	}

	private pprof(uri: Uri, token: CancellationToken) {
		const goBin = getBinPath('go');
		return new Promise<string | undefined>((resolve) => {
			const cp = exec(`${goBin} tool pprof -tree ${uri.fsPath}`, async (err, stdout, stderr) => {
				if (err || stderr) {
					const m = 'Failed to execute `go tool pprof`';
					if (err) outputChannel.appendLine(`${m}: ${err}`);
					else outputChannel.append(`${m}:\n${stderr}`);
					outputChannel.show();
					await window.showErrorMessage(m);
					resolve(void 0);
				} else {
					resolve(stdout);
				}
			});

			token?.onCancellationRequested(() => cp.kill());
		});
	}
}
