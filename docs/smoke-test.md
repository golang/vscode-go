# Smoke Test

Before releasing a new version of the extension, please run the following smoke test to make sure that all features are working.

## Set up

First, clone [golang.org/x/example](https://github.com/golang/example). At the time of writing (June 2020), this repository has not changed since 2017. If it has changed since, these steps may not be exactly reproducible and should be adjusted.

For now, we smoke test the extension only in [`GOPATH`](gopath.md) mode.

If it does not already exist:

```bash
mkdir $GOPATH/src/github.com/golang
```

Then,

```bash
cd $GOPATH/src/github.com/golang
git clone https://github.com/golang/example
cd example
```

Next, [build and sideload the modified Go extension](contributing.md#sideload) and open the `example/hello` directory. Open `hello.go`.

## Test code navigation

1. Go to definition on `fmt.Println`.
2. Go to definition on `stringutil.Reverse`.
3. Find all references of `fmt.Println`.
4. Find all references of `stringutil.Reverse`.
5. Hover over `fmt.Println`.
6. Hover over `stringutil.Reverse`.

## Test autocompletion

<!--TODO(rstambler): We should require the user to install another package in their GOPATH and expect unimported completions from that package.-->

1. Trigger autocompletion (Ctrl+Space) after `fmt.`.
2. Trigger autocompletion (Ctrl+Space) after `stringutil.`.
3. Enter a newline in the `main` function and type `fmt.`.
4. Enter a newline in the `main` function and type `parser.`. Expect suggestions from the unimported standard library `go/parser` package.
5. Enter a newline in the `main` function and type `fmt.`. Select the `fmt.Println` completion and observe the outcome. Toggle the `go.useCodeSnippetsOnFunctionSuggest` setting to ensure that placeholders are provided.
6. Test signature help by manually triggering it (Ctrl+Shift+Space) while completing `fmt.Println`.
7. Test signature help by manually triggering it (Ctrl+Shift+Space) while completing `stringutil.Reverse`.

## Test diagnostics

Enable `go.buildOnSave`, `go.vetOnSave`, and `go.lintOnSave`.

1. Add `var x int` to the `main` function and expect a build diagnostic.
2. Add `fmt.Printf("hi", 1)` and expect a vet diagnostic.
3. Add the following function to the bottom of the file and expect a lint diagnostic.

    ```go
    // Hello is hi.
    func Hi() {}
    ```

You can also try toggling the `"package"` and `"workspace"` configurations for these settings.

## Test formatting and import organization

1. Hit enter 3 times in the `main` function and save. Expect formatting to remove all but one line.
2. Remove the `"fmt"` import. Save and expect it to return.
3. Remove the `"github.com/golang/example/stringutil"` import. Save and expect it to return.
4. Confirm that the `Go: Add Import` command works (add `"archive/tar"`).

## Test renaming

1. Add the following to the `main` function, then rename `x` to `y`.

    ```go
    var x int
    fmt.Println(x)
    ```

2. Rename `stringutil.Reverse`. `reverse.go` and `reverse_test.go` should be dirtied.
