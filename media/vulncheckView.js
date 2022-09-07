/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// Script for VulncheckResultViewProvider's webview.

(function () {

	// @ts-ignore
	const vscode = acquireVsCodeApi();

	const logContainer = /** @type {HTMLElement} */ (document.querySelector('.log'));
	const vulnsContainer = /** @type {HTMLElement} */ (document.querySelector('.vulns'));
	const unaffectingContainer = /** @type {HTMLElement} */ (document.querySelector('.unaffecting'));
	const debugContainer = /** @type {HTMLElement} */ (document.querySelector('.debug'));

	vulnsContainer.addEventListener('click', (event) => {
		let node = event && event.target;
		let handled = false;
		console.log(`${node.type} ${node.tagName} ${node.className} ${node.id} data:${node.dataset?.target} dir:${node.dataset?.dir}`);
		if (node?.tagName === 'A' && node.href) {
			// Ask vscode to handle link opening.
			vscode.postMessage({ type: 'open', target: node.href });
		} else if (node?.tagName === 'SPAN' && node.className === 'vuln-fix' && node.dataset?.target && node.dataset?.dir) {
			vscode.postMessage({ type: 'fix', target: node.dataset?.target, dir: node.dataset?.dir });
		}

		if (handled) {
			event.preventDefault();
			event.stopPropagation();
		}
	});

	const errorContainer = document.createElement('div');
	document.body.appendChild(errorContainer);
	errorContainer.className = 'error'
	errorContainer.style.display = 'none'

	function packageVersion(/** @type {string} */mod, /** @type {string} */pkg, /** @type {string|undefined} */ver) {
		if (!ver) {
			return 'N/A';
		}

		if (mod === 'stdlib' && ver.startsWith('v')) {
			ver = `go${ver.slice(1)}`;
		}
		return `<a href="https://pkg.go.dev/${pkg}@${ver}">${pkg}@${ver}</a>`;
	}

	function modVersion(/** @type {string} */mod, /** @type {string|undefined} */ver) {
		if (!ver) {
			return 'N/A';
		}

		if (mod === 'stdlib' && ver.startsWith('v')) {
			ver = `go${ver.slice(1)}`;
		}
		return `<a href="https://pkg.go.dev/${mod}@${ver}">${mod}@${ver}</a>`;
	}

	function offerUpgrade(/** @type {string} */dir, /** @type {string} */mod, /** @type {string|undefined} */ver) {
		if (mod === 'stdlib') {
			return '';
		}
		if (dir && mod && ver) {
			return ` [<span class="vuln-fix" data-target="${mod}@${ver}" data-dir="${dir}">go get</span> | <span class="vuln-fix" data-target="${mod}@latest" data-dir="${dir}">go get latest</span>]`
		}
		return '';
	}

	function snapshotContent() {
		const res = {
			'log': logContainer.innerHTML,
			'vulns': vulnsContainer.innerHTML,
			'unaffecting': unaffectingContainer.innerHTML
		};
		return JSON.stringify(res);
	}

	/**
	 * Render the document in the webview.
	 */
	function updateContent(/** @type {string} */ text = '{}') {
		let json;
		try {
			json = JSON.parse(text);
		} catch {
			errorContainer.innerText = 'Error: Document is not valid json';
			errorContainer.style.display = '';
			return;
		}
		errorContainer.style.display = 'none';

		const timeinfo = (startDate, durationMillisec) => {
			if (!startDate) { return '' }
			return durationMillisec ? `${startDate} (took ${durationMillisec} msec)` : `${startDate}`;
		}
		debugContainer.innerHTML = `Analyzed at: ${timeinfo(json.Start, json.Duration)}`;

		const vulns = json.Vuln || [];
		const affecting = vulns.filter((v) => v.CallStackSummaries?.length);
		const unaffecting = vulns.filter((v) => !v.CallStackSummaries?.length);

		logContainer.innerHTML = `
<pre>cd ${json.Dir || ''}; govulncheck ${json.Pattern || ''}</pre>
Found ${affecting?.length || 0} known vulnerabilities.`;
		
		vulnsContainer.innerHTML = '';
		affecting.forEach((vuln) => {
			const element = document.createElement('div');
			element.className = 'vuln';
			vulnsContainer.appendChild(element);

			// TITLE - Vuln ID
			const title = document.createElement('h2');
			title.innerHTML = `<div class="vuln-icon-warning"><i class="codicon codicon-warning"></i></div><a href="${vuln.URL}">${vuln.ID}</a>`;
			title.className = 'vuln-title';
			element.appendChild(title);

			// DESCRIPTION - short text (aliases)
			const desc = document.createElement('p');
			desc.innerHTML = Array.isArray(vuln.Aliases) && vuln.Aliases.length ? `${vuln.Details} (${vuln.Aliases.join(', ')})` : vuln.Details;
			desc.className = 'vuln-desc';
			element.appendChild(desc);

			// DETAILS - dump of all details
			const details = document.createElement('table');
			details.className = 'vuln-details'
			details.innerHTML = `
			<tr><td>Package</td><td>${vuln.PkgPath}</td></tr>
			<tr><td>Found in Version</td><td>${packageVersion(vuln.ModPath, vuln.PkgPath, vuln.CurrentVersion)}</td></tr>
			<tr><td>Fixed Version</td><td>${packageVersion(vuln.ModPath, vuln.PkgPath, vuln.FixedVersion)} ${offerUpgrade(json.Dir, vuln.ModPath, vuln.FixedVersion)}</td></tr>
			<tr><td>Affecting</td><td>${vuln.AffectedPkgs?.join('<br>')}</td></tr>
			`;
			element.appendChild(details);

			/* TODO: Action for module version upgrade */
			/* TODO: Explain module dependency - why am I depending on this vulnerable version? */

			// EXEMPLARS - call stacks (initially hidden)
			const examples = document.createElement('details');
			examples.innerHTML = `<summary>${vuln.CallStackSummaries?.length || 0}+ findings</summary>`;

			// Call stacks
			const callstacksContainer = document.createElement('p');
			callstacksContainer.className = 'stacks';
			vuln.CallStackSummaries?.forEach((summary, idx) => {
				const callstack = document.createElement('details');
				const s = document.createElement('summary');
				s.innerText = summary;
				callstack.appendChild(s);

				const stack = document.createElement('div');
				stack.className = 'stack';
				const cs = vuln.CallStacks[idx];
				cs.forEach((c) => {
					const p = document.createElement('p');
					const pos = c.URI ? `${c.URI}?${c.Pos.line || 0}` : '';
					p.innerHTML = pos ? `<a href="${pos}">${c.Name}</a>` : c.Name;
					stack.appendChild(p);
				});
				callstack.appendChild(stack);

				callstacksContainer.appendChild(callstack);
			})

			examples.appendChild(callstacksContainer);
			element.appendChild(examples);
		});

		unaffectingContainer.innerText = '';
		if (unaffecting.length > 0) {
			const notice = document.createElement('div');
			notice.className = 'info';
			notice.innerHTML = `
<hr></hr>The vulnerabilities below are in packages that you import, 
but your code does not appear to call any vulnerable functions. 
You may not need to take any action. See 
<a href="https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck">
https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck</a>
for details.
`;

			unaffectingContainer.appendChild(notice);

			unaffecting.forEach((vuln) => {
				const element = document.createElement('div');
				element.className = 'vuln';
				unaffectingContainer.appendChild(element);

				// TITLE - Vuln ID
				const title = document.createElement('h2');
				title.innerHTML = `<div class="vuln-icon-info"><i class="codicon codicon-info"></i></div><a href="${vuln.URL}">${vuln.ID}</a>`;
				title.className = 'vuln-title';
				element.appendChild(title);

				// DESCRIPTION - short text (aliases)
				const desc = document.createElement('p');
				desc.innerHTML = Array.isArray(vuln.Aliases) && vuln.Aliases.length ? `${vuln.Details} (${vuln.Aliases.join(', ')})` : vuln.Details;
				desc.className = 'vuln-desc';
				element.appendChild(desc);

				// DETAILS - dump of all details
				// TODO(hyangah):
				//   - include the current version & package name when gopls provides them.
				//   - offer upgrade like affect vulnerabilities. We will need to install another event listener
				//     on unaffectingContainer. See vulnsContainer.addEventListener.
				const details = document.createElement('table');
				details.className = 'vuln-details'
				if (vuln.FixedVersion) {
					details.innerHTML = `<tr><td>Fixed Version</td><td>${modVersion(vuln.ModPath, vuln.FixedVersion)}</td></tr>`;
				} else {
					details.innerHTML = `<tr><td>Fixed Version</td><td>unavailable for ${vuln.ModPath}</td></tr>`;
				}
				element.appendChild(details);
			});
		}
	}

	// Message Passing between Extension and Webview
	//
	//  Extension sends 'update' to Webview to trigger rerendering.
	//  Webview sends 'link' to Extension to forward all link
	//     click events so the extension can handle the event.
	//
	//  Extension sends 'snapshot-request' to trigger dumping
	//     of the current DOM in the 'vulns' container.
	//  Webview sends 'snapshot-result' to the extension
	//     as the response to snapshot-request.

	// Handle messages sent from the extension to the webview
	window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.type) {
			case 'update':
				const text = message.text;

				updateContent(text);
				// Then persist state information.
				// This state is returned in the call to `vscode.getState` below when a webview is reloaded.
				vscode.setState({ text });
				return;
			// Message for testing. Returns a current DOM in a serialized format.
			case 'snapshot-request':
				const result = snapshotContent();
				vscode.postMessage({ type: 'snapshot-result', target: result });
				return;
		}
	});

	// Webviews are normally torn down when not visible and re-created when they become visible again.
	// State lets us save information across these re-loads
	const state = vscode.getState();
	if (state) {
		updateContent(state.text);
	};
	// TODO: Handle 'details' expansion info and store the state using
	// vscode.setState or retainContextWhenHidden. Currently, we are storing only
	// the document text. (see windowEventHandler)
}());
