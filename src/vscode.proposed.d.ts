/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the place for API experiments and proposals.
 * These API are NOT stable and subject to change. They are only available in the Insiders
 * distribution and CANNOT be used in published extensions.
 *
 * To test these API in local environment:
 * - Use Insiders release of 'VS Code'.
 * - Add `"enableProposedApi": true` to your package.json.
 * - Copy this file to your project.
 */

declare module 'vscode' {
	//#region https://github.com/microsoft/vscode/issues/107467
	export namespace test {
		/**
		 * Creates a new test controller.
		 *
		 * @param id Identifier for the controller, must be globally unique.
		 */
		export function createTestController(id: string, label: string): TestController;

		/**
		 * Requests that tests be run by their controller.
		 * @param run Run options to use.
		 * @param token Cancellation token for the test run
		 * @stability experimental
		 */
		export function runTests(run: TestRunRequest, token?: CancellationToken): Thenable<void>;

		/**
		 * Returns an observer that watches and can request tests.
		 * @stability experimental
		 */
		export function createTestObserver(): TestObserver;

		/**
		 * Creates a new managed {@link TestItem} instance. It can be added into
		 * the {@link TestItem.children} of an existing item, or into the
		 * {@link TestController.items}.
		 * @param id Unique identifier for the TestItem.
		 * @param label Human-readable label of the test item.
		 * @param uri URI this TestItem is associated with. May be a file or directory.
		 */
		export function createTestItem(id: string, label: string, uri?: Uri): TestItem;

		/**
		 * List of test results stored by the editor, sorted in descending
		 * order by their `completedAt` time.
		 * @stability experimental
		 */
		export const testResults: ReadonlyArray<TestRunResult>;

		/**
		 * Event that fires when the {@link testResults} array is updated.
		 * @stability experimental
		 */
		export const onDidChangeTestResults: Event<void>;
	}

	/**
	 * @stability experimental
	 */
	export interface TestObserver {
		/**
		 * List of tests returned by test provider for files in the workspace.
		 */
		readonly tests: ReadonlyArray<TestItem>;

		/**
		 * An event that fires when an existing test in the collection changes, or
		 * null if a top-level test was added or removed. When fired, the consumer
		 * should check the test item and all its children for changes.
		 */
		readonly onDidChangeTest: Event<TestsChangeEvent>;

		/**
		 * Dispose of the observer, allowing the editor to eventually tell test
		 * providers that they no longer need to update tests.
		 */
		dispose(): void;
	}

	/**
	 * @stability experimental
	 */
	export interface TestsChangeEvent {
		/**
		 * List of all tests that are newly added.
		 */
		readonly added: ReadonlyArray<TestItem>;

		/**
		 * List of existing tests that have updated.
		 */
		readonly updated: ReadonlyArray<TestItem>;

		/**
		 * List of existing tests that have been removed.
		 */
		readonly removed: ReadonlyArray<TestItem>;
	}

	// Todo@api: this is basically the same as the TaskGroup, which is a class that
	// allows custom groups to be created. However I don't anticipate having any
	// UI for that, so enum for now?
	export enum TestRunConfigurationGroup {
		Run = 1,
		Debug = 2,
		Coverage = 3
	}

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
	// todo@api We have been there with NotebookCtrl#executeHandler and I believe the recommendation is still not to inline.
	// At least with that we can still do it later
	export type TestRunHandler = (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void;

	export interface TestRunConfiguration {
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
		 * Configures where this configuration is grouped in the UI. If there
		 * are no configurations for a group, it will not be available in the UI.
		 */
		readonly group: TestRunConfigurationGroup;

		/**
		 * Controls whether this configuration is the default action that will
		 * be taken when its group is actions. For example, if the user clicks
		 * the generic "run all" button, then the default configuration for
		 * {@link TestRunConfigurationGroup.Run} will be executed.
		 */
		isDefault: boolean;

		/**
		 * If this method is present a configuration gear will be present in the
		 * UI, and this method will be invoked when it's clicked. When called,
		 * you can take other editor actions, such as showing a quick pick or
		 * opening a configuration file.
		 */
		configureHandler?: () => void;

		/**
		 * Starts a test run. When called, the controller should call
		 * {@link TestController.createTestRun}. All tasks associated with the
		 * run should be created before the function returns or the reutrned
		 * promise is resolved.
		 *
		 * @param request Request information for the test run
		 * @param cancellationToken Token that signals the used asked to abort the
		 * test run. If cancellation is requested on this token, all {@link TestRun}
		 * instances associated with the request will be
		 * automatically cancelled as well.
		 */
		runHandler: TestRunHandler;

		/**
		 * Deletes the run configuration.
		 */
		dispose(): void;
	}

	/**
	 * Interface to discover and execute tests.
	 */
	// todo@api maybe some words on this being the "entry point"
	export interface TestController {
		/**
		 * The ID of the controller, passed in {@link vscode.test.createTestController}
		 */
		// todo@api maybe explain what the id is used for and iff it must be globally unique or only unique within the extension
		readonly id: string;

		/**
		 * Human-readable label for the test controller.
		 */
		label: string;

		/**
		 * Available test items. Tests in the workspace should be added in this
		 * collection. The extension controls when to add these, although the
		 * editor may request children using the {@link resolveChildrenHandler},
		 * and the extension should add tests for a file when
		 * {@link vscode.workspace.onDidOpenTextDocument} fires in order for
		 * decorations for tests within the file to be visible.
		 *
		 * Tests in this collection should be watched and updated by the extension
		 * as files change. See {@link resolveChildrenHandler} for details around
		 * for the lifecycle of watches.
		 */
		readonly items: TestItemCollection;

		/**
		 * Creates a configuration used for running tests. Extensions must create
		 * at least one configuration in order for tests to be run.
		 * @param label Human-readable label for this configuration
		 * @param group Configures where this configuration is grouped in the UI.
		 * @param runHandler Function called to start a test run
		 * @param isDefault Whether this is the default action for the group
		 */
		createRunConfiguration(
			label: string,
			group: TestRunConfigurationGroup,
			runHandler: TestRunHandler,
			isDefault?: boolean
		): TestRunConfiguration;

		/**
		 * A function provided by the extension that the editor may call to request
		 * children of a test item, if the {@link TestItem.canExpand} is `true`.
		 * When called, the item should discover children and call
		 * {@link vscode.test.createTestItem} as children are discovered.
		 *
		 * The item in the explorer will automatically be marked as "busy" until
		 * the function returns or the returned thenable resolves.
		 *
		 * The controller may wish to set up listeners or watchers to update the
		 * children as files and documents change.
		 *
		 * @param item An unresolved test item for which
		 * children are being requested
		 */
		// todo@API maybe just `resolveHandler` so that we could extends its usage in the future?
		resolveChildrenHandler?: (item: TestItem) => Thenable<void> | void;

		/**
		 * Creates a {@link TestRun<T>}. This should be called by the
		 * {@link TestRunner} when a request is made to execute tests, and may also
		 * be called if a test run is detected externally. Once created, tests
		 * that are included in the results will be moved into the
		 * {@link TestResultState.Pending} state.
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
		 * Unregisters the test controller, disposing of its associated tests
		 * and unpersisted results.
		 */
		dispose(): void;
	}

	/**
	 * Options given to {@link test.runTests}.
	 */
	export class TestRunRequest {
		/**
		 * Filter for specific tests to run. If given, the extension should run all
		 * of the given tests and all children of the given tests, excluding
		 * any tests that appear in {@link TestRunRequest.exclude}. If this is
		 * not given, then the extension should simply run all tests.
		 */
		include?: TestItem[];

		/**
		 * An array of tests the user has marked as excluded in the editor. May be
		 * omitted if no exclusions were requested. Test controllers should not run
		 * excluded tests or any children of excluded tests.
		 */
		exclude?: TestItem[];

		/**
		 * The configuration used for this request. This will always be defined
		 * for requests issued from the editor UI, though extensions may
		 * programmatically create requests not associated with any configuration.
		 */
		configuration?: TestRunConfiguration;

		/**
		 * @param tests Array of specific tests to run, or undefined to run all tests
		 * @param exclude Tests to exclude from the run
		 * @param configuration The run configuration used for this request.
		 */
		constructor(include?: readonly TestItem[], exclude?: readonly TestItem[], configuration?: TestRunConfiguration);
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
		 * Updates the state of the test in the run. Calling with method with nodes
		 * outside the {@link TestRunRequest.tests} or in the
		 * {@link TestRunRequest.exclude} array will no-op.
		 *
		 * @param test The test to update
		 * @param state The state to assign to the test
		 * @param duration Optionally sets how long the test took to run, in milliseconds
		 */
		//todo@API is this "update" state or set final state? should this be called setTestResult?
		setState(test: TestItem, state: TestResultState, duration?: number): void;

		/**
		 * Appends a message, such as an assertion error, to the test item.
		 *
		 * Calling with method with nodes outside the {@link TestRunRequest.tests}
		 * or in the {@link TestRunRequest.exclude} array will no-op.
		 *
		 * @param test The test to update
		 * @param message The message to add
		 */
		appendMessage(test: TestItem, message: TestMessage): void;

		/**
		 * Appends raw output from the test runner. On the user's request, the
		 * output will be displayed in a terminal. ANSI escape sequences,
		 * such as colors and text styles, are supported.
		 *
		 * @param output Output text to append
		 * @param associateTo Optionally, associate the given segment of output
		 */
		appendOutput(output: string): void;

		/**
		 * Signals that the end of the test run. Any tests whose states have not
		 * been updated will be moved into the {@link TestResultState.Unset} state.
		 */
		// todo@api is the Unset logic smart and only considering those tests that are included?
		end(): void;
	}

	/**
	 * Collection of test items, found in {@link TestItem.children} and
	 * {@link TestController.items}.
	 */
	export interface TestItemCollection {
		/**
		 * A read-only array of all the test items children. Can be retrieved, or
		 * set in order to replace children in the collection.
		 */
		// todo@API unsure if this should readonly and have a separate replaceAll-like function
		all: readonly TestItem[];

		/**
		 * Adds the test item to the children. If an item with the same ID already
		 * exists, it'll be replaced.
		 */
		add(item: TestItem): void;

		/**
		 * Removes the a single test item from the collection.
		 */
		//todo@API `delete` as Map, EnvironmentVariableCollection, DiagnosticCollection
		remove(itemId: string): void;

		/**
		 * Efficiently gets a test item by ID, if it exists, in the children.
		 */
		get(itemId: string): TestItem | undefined;
	}

	/**
	 * A test item is an item shown in the "test explorer" view. It encompasses
	 * both a suite and a test, since they have almost or identical capabilities.
	 */
	export interface TestItem {
		/**
		 * Unique identifier for the TestItem. This is used to correlate
		 * test results and tests in the document with those in the workspace
		 * (test explorer). This must not change for the lifetime of the TestItem.
		 */
		// todo@API globally vs extension vs controller unique. I would strongly recommend non-global
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
		 * The parent of this item, given in {@link vscode.test.createTestItem}.
		 * This is undefined top-level items in the `TestController`, and for
		 * items that aren't yet assigned to a parent.
		 */
		// todo@api obsolete? doc is outdated at least
		readonly parent?: TestItem;

		/**
		 * Indicates whether this test item may have children discovered by resolving.
		 * If so, it will be shown as expandable in the Test Explorer  view, and
		 * expanding the item will cause {@link TestController.resolveChildrenHandler}
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

		/**
		 * Marks the test as outdated. This can happen as a result of file changes,
		 * for example. In "auto run" mode, tests that are outdated will be
		 * automatically rerun after a short delay. Invoking this on a
		 * test with children will mark the entire subtree as outdated.
		 *
		 * Extensions should generally not override this method.
		 */
		// todo@api still unsure about this
		invalidateResults(): void;
	}

	/**
	 * Possible states of tests in a test run.
	 */
	export enum TestResultState {
		// Initial state
		Unset = 0,
		// Test will be run, but is not currently running.
		Queued = 1,
		// Test is currently running
		Running = 2,
		// Test run has passed
		Passed = 3,
		// Test run has failed (on an assertion)
		Failed = 4,
		// Test run has been skipped
		Skipped = 5,
		// Test run failed for some other reason (compilation error, timeout, etc)
		// todo@api could I just use `Skipped` and TestItem#error?
		Errored = 6
	}

	/**
	 * Represents the severity of test messages.
	 */
	export enum TestMessageSeverity {
		Error = 0,
		Warning = 1,
		Information = 2,
		Hint = 3
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
		 * Message severity. Defaults to "Error".
		 */
		severity: TestMessageSeverity;

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

	/**
	 * TestResults can be provided to the editor in {@link test.publishTestResult},
	 * or read from it in {@link test.testResults}.
	 *
	 * The results contain a 'snapshot' of the tests at the point when the test
	 * run is complete. Therefore, information such as its {@link Range} may be
	 * out of date. If the test still exists in the workspace, consumers can use
	 * its `id` to correlate the result instance with the living test.
	 *
	 * @todo coverage and other info may eventually be provided here
	 */
	export interface TestRunResult {
		/**
		 * Unix milliseconds timestamp at which the test run was completed.
		 */
		completedAt: number;

		/**
		 * Optional raw output from the test run.
		 */
		output?: string;

		/**
		 * List of test results. The items in this array are the items that
		 * were passed in the {@link test.runTests} method.
		 */
		results: ReadonlyArray<Readonly<TestResultSnapshot>>;
	}

	/**
	 * A {@link TestItem}-like interface with an associated result, which appear
	 * or can be provided in {@link TestResult} interfaces.
	 */
	export interface TestResultSnapshot {
		/**
		 * Unique identifier that matches that of the associated TestItem.
		 * This is used to correlate test results and tests in the document with
		 * those in the workspace (test explorer).
		 */
		readonly id: string;

		/**
		 * URI this TestItem is associated with. May be a file or file.
		 */
		readonly uri?: Uri;

		/**
		 * Display name describing the test case.
		 */
		readonly label: string;

		/**
		 * Optional description that appears next to the label.
		 */
		readonly description?: string;

		/**
		 * Location of the test item in its `uri`. This is only meaningful if the
		 * `uri` points to a file.
		 */
		readonly range?: Range;

		/**
		 * State of the test in each task. In the common case, a test will only
		 * be executed in a single task and the length of this array will be 1.
		 */
		readonly taskStates: ReadonlyArray<TestSnapshoptTaskState>;

		/**
		 * Optional list of nested tests for this item.
		 */
		readonly children: Readonly<TestResultSnapshot>[];
	}

	export interface TestSnapshoptTaskState {
		/**
		 * Current result of the test.
		 */
		readonly state: TestResultState;

		/**
		 * The number of milliseconds the test took to run. This is set once the
		 * `state` is `Passed`, `Failed`, or `Errored`.
		 */
		readonly duration?: number;

		/**
		 * Associated test run message. Can, for example, contain assertion
		 * failure information if the test fails.
		 */
		readonly messages: ReadonlyArray<TestMessage>;
	}

	//#endregion
}
