### Release process

The golang.go-nightly extension is released daily during weekdays, based on the latest commit to the master branch.

(Note: the release process is currently in GH workflow. We are in process of moving it to a GCB workflow.)

* Dockerfile: defines the image containing tools and environments needed to build and test the extension. (e.g. Go, Node.js, jq, etc.)
* build-ci-image.yaml: defines the workflow to build the container image used for extension testing and releasing.
* release-nightly.yaml: defines the workflow that builds the nightly extension and runs tests. The built extension is pushed only after all tests pass.
