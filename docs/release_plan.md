# Release candidate (DATE)

-   [ ] Announce the release, leave enough time for teams to surface any last minute issues that need to get in before freeze. Make sure debugger and gopls teams are looped in as well.
-   [ ] Create a milestone with the issues that are fixed by this release
-	[ ] Update `master` for the release
	-	[ ] Update hardcoded latest version for `dlv-dap` and `gopls`
	-   [ ] Update [`CHANGELOG.md`](https://github.com/golang/vscode-go/blob/master/CHANGELOG.md)
        -   [ ] Make sure the "Thanks" section is up-to-date
        -   [ ] Check the Markdown rendering to make sure everything looks good
-   [ ] Update `release` for the release
    -   [ ] Create a branch against `release` for a pull request
    -   [ ] Merge changes from `master` to prepare for the release
    -   [ ] Change the version in [`package.json`](https://github.com/golang/vscode-go/blob/master/package.json) from a `-dev` suffix
    -   [ ] Run `npm install` to make sure [`package-lock.json`](https://github.com/golang/vscode-go/blob/master/package.json) is up-to-date
    -   [ ] Update the license file (`$ tools/license.sh; mv LICENSE.prod LICENSE`)
-   [ ] Check the [Long Tests status](https://github.com/golang/vscode-go/actions?query=workflow%3A%22Long+Tests%22)  is green. Otherwise, fix the tests, send cls for review, submit them, and repeat. 
-   [ ] Perform manual [smoke tests]( https://github.com/golang/vscode-go/blob/master/docs/smoke-test.md)
-   [ ] Create new version tag for X.XX.X-rc.1 at gerrit’s vscode-go [repo management page](https://go-review.googlesource.com/admin/repos/vscode-go,tags)
-   [ ] Go to the release page https://github.com/golang/vscode-go/releases and check if the new release candidate is up. If necessary, you can manually edit the comment by clicking the “Edit” button. Don’t mutate uploaded vsix.
-   [ ] Ask editor team and contributors to this release to test the release candidate

# Release Candidate >1 (if necessary)
- 	[ ] Fix any bugs on `master` and cherry pick changes to `release
-   [ ] Create new version tag for X.XX.X-rc.1 at gerrit’s vscode-go [repo management page](https://go-review.googlesource.com/admin/repos/vscode-go,tags)
-   [ ] Go to the release page https://github.com/golang/vscode-go/releases and check if the new release candidate is up. If necessary, you can manually edit the comment by clicking the “Edit” button. Don’t mutate uploaded vsix.
-   [ ] Ask editor team and contributors to this release to test the release candidate


# Final (DATE)
-	[ ] Tag the new release
-	[ ] Update the release description with CHANGELOG contents
-	[ ] Close the milestone

# Prepare for the Next Release
-   [ ] Update `master` post-release
    -   [ ] Bump the version number to the next monthly ("X.XX.X-dev") release in the `master` branch
        -   [ ] `package.json`
        -   [ ] `package-lock.json`
