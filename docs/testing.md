# Testing

We currently use two separate continuous integration (CI) systems to test all changes and pushed commits:

* [Tests running in Google Cloud Build (GCB)](#testing-via-gcb), and
* [Tests running with GitHub Actions](#testing-via-github-actions)

This is a temporary setup; once GCB fully supports our desired workflow, we plan to use only the GCB-based setup for CI.

The [release of the Go Nightly](#nightly-release) extension is automated using GitHub Actions.

## Testing via GCB

This workflow is triggered for Gerrit CLs and for all  commits merged into the master branch. Note that our main repository is [go.googlesource.com/vscode-go](https://go.googlesource.com/vscode-go), and
[github.com/golang/vscode-go](https://github.com/golang/vscode-go) is a mirror of the Go Git repository. All PRs sent to the GitHub repository will be converted to Gerrit CLs.

Currently, the results of the CI run are visible only to GCB  project members. We are working on improving this workflow and making the results visible to the public and easily accessible through our Gerrit review UI.

The GCB workflow is defined in [`build/cloudbuild.yaml`](../build/cloudbuild.yaml) and [`build/all.bash`](../build/all.bash).

The Docker container used for testing is defined in [`build/cloudbuild.container.yaml`](../build/cloudbuild.container.yaml) and [`build/Dockerfile`](../build/Dockerfile).

GCB project members can manually trigger a build and test their local changes. Follow the [GCB instructions](https://cloud.google.com/cloud-build/docs/running-builds/start-build-manually) to set up the environment and tools, and then run:

```bash
gcloud builds submit --config=build/cloudbuild.yaml
```

To modify and rebuild the Docker container image, run:

```bash
gcloud builds submit --config=build/cloudbuild.container.yaml
```

## Testing via GitHub Actions

This is the workflow triggered for every PR and commit made to our mirror repository on GitHub, [github.com/golang/vscode-go](https://github.com/golang/vscode-go). We use this CI system to run tests on platforms that GCB does not yet support. This workflow is not triggered by CLs sent via Gerrit yet.

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) defines the GitHub Actions-based CI workflow.

### [Nightly Release](nightly.md)

A new version of the [Go Nightly](nightly.md) extension, based on the current `master` branch, is released at least once a day between Monday and Thursday. Learn more in the [Go Nightly documentation](nightly.md).

The daily release process is automated via a GitHub Action. See [`.github/workflows/release.yml`](../.github/workflows/release.yml) and [`build/all.bash`](../build/all.bash).
