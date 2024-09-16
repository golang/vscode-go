### Release process

> 🚧 Under construction 🚧

We are currently working on migrating the release process to the Go project's relui (golang.org/x/build/cmd/relui).

* Dockerfile: defines the image containing tools and environments needed to build and test the extension. (e.g. Go, Node.js, jq, etc.)
* build-ci-image.yaml: defines the workflow to build the container image used for extension testing and releasing.
* release.yaml: defines the (soon-to-be-deprecated) workflow to build/publish the extension in GCB.