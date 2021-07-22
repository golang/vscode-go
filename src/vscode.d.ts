/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace tests {
		/**
		 * Creates a new test controller.
		 *
		 * @param id Identifier for the controller, must be globally unique.
		 */
		export function createTestController(id: string, label: string): TestController;
	}

	/**
	 * The kind of executions that {@link TestRunProfile | TestRunProfiles} control.
	 */
	export enum TestRunProfileKind {
		Run = 1,
		Debug = 2,
		Coverage = 3
	}

	/**
	 * A TestRunProfile describes one way to execute tests in a {@link TestController}.
	 */
	export interface TestRunProfile {
		/**
		 * Label shown to the user in the UI.
		 *
		 * Note that the label has some significance if the user requests that
		 * tests be re-run in a certain way. For example, if tests were run
		 * normally and the user requests to re-run them in debug mode, the editor
		 * will attempt use a configuration with the same label in the `Debug`
		 * group. If there is no such configuration, the default will be used.
		 */
		label: string;

		/**
		 * Configures what kind of execution this profile controls. If there
		 * are no profiles for a kind, it will not be available in the UI.
		 */
		readonly kind: TestRunProfileKind;

		/**
		 * Controls whether this profile is the default action that will
		 * be taken when its group is actions. For example, if the user clicks
		 * the generic "run all" button, then the default profile for
		 * {@link TestRunProfileKind.Run} will be executed.
		 */
		isDefault: boolean;

		/**
		 * If this method is present, a configuration gear will be present in the
		 * UI, and this method will be invoked when it's clicked. When called,
		 * you can take other editor actions, such as showing a quick pick or
		 * opening a configuration file.
		 */
		configureHandler?: () => void;

		/**
		 * Handler called to start a test run. When invoked, the function should
		 * {@link TestController.createTestRun} at least once, and all tasks
		 * associated with the run should be created before the function returns
		 * or the reutrned promise is resolved.
		 *
		 * @param request Request information for the test run
		 * @param cancellationToken Token that signals the used asked to abort the
		 * test run. If cancellation is requested on this token, all {@link TestRun}
		 * instances associated with the request will be
		 * automatically cancelled as well.
		 */
		runHandler: (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void;

		/**
		 * Deletes the run profile.
		 */
		dispose(): void;
	}

	/**
	 * Entry point to discover and execute tests. It contains {@link items} which
	 * are used to populate the editor UI, and is associated with
	 * {@link createRunProfile run profiles} to allow
	 * for tests to be executed.
	 */
	export interface TestController {
		/**
		 * The ID of the controller, passed in {@link vscode.tests.createTestController}.
		 * This must be globally unique,
		 */
		readonly id: string;

		/**
		 * Human-readable label for the test controller.
		 */
		label: string;

		/**
		 * Available test items. Tests in the workspace should be added in this
		 * collection. The extension controls when to add these, although the
		 * editor may request children using the {@link resolveHandler},
		 * and the extension should add tests for a file when
		 * {@link vscode.workspace.onDidOpenTextDocument} fires in order for
		 * decorations for tests within the file to be visible.
		 *
		 * Tests in this collection should be watched and updated by the extension
		 * as files change. See {@link resolveHandler} for details around
		 * for the lifecycle of watches.
		 */
		readonly items: TestItemCollection;

		/**
		 * Creates a profile used for running tests. Extensions must create
		 * at least one profile in order for tests to be run.
		 * @param label Human-readable label for this profile
		 * @param group Configures where this profile is grouped in the UI.
		 * @param runHandler Function called to start a test run
		 * @param isDefault Whether this is the default action for the group
		 */
		createRunProfile(
			label: string,
			group: TestRunProfileKind,
			runHandler: (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void,
			isDefault?: boolean
		): TestRunProfile;

		/**
		 * A function provided by the extension that the editor may call to request
		 * children of a test item, if the {@link TestItem.canResolveChildren} is
		 * `true`. When called, the item should discover children and call
		 * {@link vscode.tests.createTestItem} as children are discovered.
		 *
		 * The item in the explorer will automatically be marked as "busy" until
		 * the function returns or the returned thenable resolves.
		 *
		 * The handler will be called `undefined` to resolve the controller's
		 * initial children.
		 *
		 * @param item An unresolved test item for which
		 * children are being requested
		 */
		resolveHandler?: (item: TestItem | undefined) => Thenable<void> | void;

		/**
		 * Creates a {@link TestRun<T>}. This should be called by the
		 * {@link TestRunner} when a request is made to execute tests, and may also
		 * be called if a test run is detected externally. Once created, tests
		 * that are included in the results will be moved into the queued state.
		 *
		 * All runs created using the same `request` instance will be grouped
		 * together. This is useful if, for example, a single suite of tests is
		 * run on multiple platforms.
		 *
		 * @param request Test run request. Only tests inside the `include` may be
		 * modified, and tests in its `exclude` are ignored.
		 * @param name The human-readable name of the run. This can be used to
		 * disambiguate multiple sets of results in a test run. It is useful if
		 * tests are run across multiple platforms, for example.
		 * @param persist Whether the results created by the run should be
		 * persisted in the editor. This may be false if the results are coming from
		 * a file already saved externally, such as a coverage information file.
		 */
		createTestRun(request: TestRunRequest, name?: string, persist?: boolean): TestRun;

		/**
		 * Creates a new managed {@link TestItem} instance. It can be added into
		 * the {@link TestItem.children} of an existing item, or into the
		 * {@link TestController.items}.
		 * @param id Identifier for the TestItem. The test item's ID must be unique
		 * in the {@link TestItemCollection} it's added to.
		 * @param label Human-readable label of the test item.
		 * @param uri URI this TestItem is associated with. May be a file or directory.
		 */
		createTestItem(id: string, label: string, uri?: Uri): TestItem;

		/**
		 * Unregisters the test controller, disposing of its associated tests
		 * and unpersisted results.
		 */
		dispose(): void;
	}

	/**
	 * Options given to {@link tests.runTests}.
	 */
	export class TestRunRequest {
		/**
		 * Filter for specific tests to run. If given, the extension should run all
		 * of the given tests and all children of the given tests, excluding
		 * any tests that appear in {@link TestRunRequest.exclude}. If this is
		 * not given, then the extension should simply run all tests.
		 *
		 * The process of running tests should resolve the children of any test
		 * items who have not yet been resolved.
		 */
		include?: TestItem[];

		/**
		 * An array of tests the user has marked as excluded from the test included
		 * in this run; exclusions should apply after inclusions.
		 *
		 * May be omitted if no exclusions were requested. Test controllers should
		 * not run excluded tests or any children of excluded tests.
		 */
		exclude?: TestItem[];

		/**
		 * The profile used for this request. This will always be defined
		 * for requests issued from the editor UI, though extensions may
		 * programmatically create requests not associated with any profile.
		 */
		profile?: TestRunProfile;

		/**
		 * @param tests Array of specific tests to run, or undefined to run all tests
		 * @param exclude Tests to exclude from the run
		 * @param profile The run profile used for this request.
		 */
		constructor(include?: readonly TestItem[], exclude?: readonly TestItem[], profile?: TestRunProfile);
	}

	/**
	 * Options given to {@link TestController.runTests}
	 */
	export interface TestRun {
		/**
		 * The human-readable name of the run. This can be used to
		 * disambiguate multiple sets of results in a test run. It is useful if
		 * tests are run across multiple platforms, for example.
		 */
		readonly name?: string;

		/**
		 * A cancellation token which will be triggered when the test run is
		 * canceled from the UI.
		 */
		readonly token: CancellationToken;

		/**
		 * Whether the test run will be persisteded across reloads by the editor UI.
		 */
		readonly isPersisted: boolean;

		/**
		 * Indicates a test in the run is queued for later execution.
		 * @param test Test item to update
		 */
		enqueued(test: TestItem): void;

		/**
		 * Indicates a test in the run has started running.
		 * @param test Test item to update
		 */
		started(test: TestItem): void;

		/**
		 * Indicates a test in the run has been skipped.
		 * @param test Test item to update
		 */
		skipped(test: TestItem): void;

		/**
		 * Indicates a test in the run has failed. You should pass one or more
		 * {@link TestMessage | TestMessages} to describe the failure.
		 * @param test Test item to update
		 * @param messages Messages associated with the test failure
		 * @param duration How long the test took to execute, in milliseconds
		 */
		failed(test: TestItem, message: TestMessage | readonly TestMessage[], duration?: number): void;

		/**
		 * Indicates a test in the run has passed.
		 * @param test Test item to update
		 * @param duration How long the test took to execute, in milliseconds
		 */
		passed(test: TestItem, duration?: number): void;

		/**
		 * Appends raw output from the test runner. On the user's request, the
		 * output will be displayed in a terminal. ANSI escape sequences,
		 * such as colors and text styles, are supported.
		 *
		 * @param output Output text to append
		 */
		appendOutput(output: string): void;

		/**
		 * Signals that the end of the test run. Any tests included in the run whose
		 * states have not been updated will have their state reset.
		 */
		end(): void;
	}

	/**
	 * Collection of test items, found in {@link TestItem.children} and
	 * {@link TestController.items}.
	 */
	export interface TestItemCollection {
		/**
		 * Gets the number of items in the collection.
		 */
		readonly size: number;

		/**
		 * Replaces the items stored by the collection.
		 * @param items Items to store, can be an array or other iterable.
		 */
		replace(items: readonly TestItem[]): void;

		/**
		 * Iterate over each entry in this collection.
		 *
		 * @param callback Function to execute for each entry.
		 * @param thisArg The `this` context used when invoking the handler function.
		 */
		forEach(callback: (item: TestItem, collection: TestItemCollection) => unknown, thisArg?: unknown): void;

		/**
		 * Adds the test item to the children. If an item with the same ID already
		 * exists, it'll be replaced.
		 * @param items Item to add.
		 */
		add(item: TestItem): void;

		/**
		 * Removes the a single test item from the collection.
		 * @param itemId Item ID to delete.
		 */
		delete(itemId: string): void;

		/**
		 * Efficiently gets a test item by ID, if it exists, in the children.
		 * @param itemId Item ID to get.
		 */
		get(itemId: string): TestItem | undefined;
	}

	/**
	 * A test item is an item shown in the "test explorer" view. It encompasses
	 * both a suite and a test, since they have almost or identical capabilities.
	 */
	export interface TestItem {
		/**
		 * Identifier for the TestItem. This is used to correlate
		 * test results and tests in the document with those in the workspace
		 * (test explorer). This cannot change for the lifetime of the TestItem,
		 * and must be unique among its parent's direct children.
		 */
		readonly id: string;

		/**
		 * URI this TestItem is associated with. May be a file or directory.
		 */
		readonly uri?: Uri;

		/**
		 * A mapping of children by ID to the associated TestItem instances.
		 */
		readonly children: TestItemCollection;

		/**
		 * The parent of this item. It's is undefined top-level items in the
		 * {@link TestController.items} and for items that aren't yet included in
		 * another item's {@link children}.
		 */
		readonly parent?: TestItem;

		/**
		 * Indicates whether this test item may have children discovered by resolving.
		 * If so, it will be shown as expandable in the Test Explorer view, and
		 * expanding the item will cause {@link TestController.resolveHandler}
		 * to be invoked with the item.
		 *
		 * Default to false.
		 */
		canResolveChildren: boolean;

		/**
		 * Controls whether the item is shown as "busy" in the Test Explorer view.
		 * This is useful for showing status while discovering children. Defaults
		 * to false.
		 */
		busy: boolean;

		/**
		 * Display name describing the test case.
		 */
		label: string;

		/**
		 * Optional description that appears next to the label.
		 */
		description?: string;

		/**
		 * Location of the test item in its `uri`. This is only meaningful if the
		 * `uri` points to a file.
		 */
		range?: Range;

		/**
		 * May be set to an error associated with loading the test. Note that this
		 * is not a test result and should only be used to represent errors in
		 * discovery, such as syntax errors.
		 */
		error?: string | MarkdownString;
	}

	/**
	 * Message associated with the test state. Can be linked to a specific
	 * source range -- useful for assertion failures, for example.
	 */
	export class TestMessage {
		/**
		 * Human-readable message text to display.
		 */
		message: string | MarkdownString;

		/**
		 * Expected test output. If given with `actualOutput`, a diff view will be shown.
		 */
		expectedOutput?: string;

		/**
		 * Actual test output. If given with `expectedOutput`, a diff view will be shown.
		 */
		actualOutput?: string;

		/**
		 * Associated file location.
		 */
		location?: Location;

		/**
		 * Creates a new TestMessage that will present as a diff in the editor.
		 * @param message Message to display to the user.
		 * @param expected Expected output.
		 * @param actual Actual output.
		 */
		static diff(message: string | MarkdownString, expected: string, actual: string): TestMessage;

		/**
		 * Creates a new TestMessage instance.
		 * @param message The message to show to the user.
		 */
		constructor(message: string | MarkdownString);
	}
}
