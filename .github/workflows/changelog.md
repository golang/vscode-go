# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project follows [Semantic Versioning](https://semver.org/).

- Repository: [kolarmusthafadanishahmed/vscode-go](https://github.com/kolarmusthafadanishahmed/vscode-go)

## [Unreleased]

### Added
- Placeholder: briefly describe new features (e.g. "Add gopls integration improvements", "Add debugger support for Delve").
- Placeholder: list new commands, settings, or UI changes.

### Changed
- Placeholder: describe notable changes in behavior or performance (e.g. "Improve startup time of language features").

### Fixed
- Placeholder: list bug fixes and regressions addressed.

### Deprecated
- Placeholder: list features that are deprecated and will be removed in a future release.

### Removed
- Placeholder: list removed features or APIs.

### Security
- Placeholder: security fixes (if any). If none, remove this subsection.

---

## [0.1.0] - YYYY-MM-DD
> Initial release — replace version and date to reflect actual first release.

### Added
- Initial packaging of the Go extension for Visual Studio Code.
- Basic language features, formatting support, and debugging integration.
- Configuration settings and workspace support.

---

How to use this file
- Update the "Unreleased" section as you merge PRs.
- When cutting a new release:
  1. Move entries from "Unreleased" into a new versioned heading `## [X.Y.Z] - YYYY-MM-DD`.
  2. Update the comparison links and changelog references if desired.
  3. Tag the release in git and publish it on GitHub.

Recommended changelog generation tools and commands
- git-cliff (recommended for conventional commits)
  - Install: `cargo install git-cliff`
  - Quick generate: `git-cliff -o CHANGELOG.md`
  - Example config (git-cliff supports mapping commit types to changelog sections).

- GitHub tools
  - Use the GitHub CLI to create releases from PRs: `gh release create vX.Y.Z --notes-file release-notes.md`
  - Use [Release Drafter](https://github.com/release-drafter/release-drafter) or `peter-evans/create-release` GitHub Action to draft release notes automatically.

- github_changelog_generator (Ruby gem)
  - Install: `gem install github_changelog_generator`
  - Run: `github_changelog_generator -u <user> -p <repo>`

Suggested GitHub Action (example) — generate changelog on new tag
```yaml
name: Generate changelog
on:
  push:
    tags:
      - 'v*.*.*'
jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install git-cliff
        run: |
          curl -sSfL https://raw.githubusercontent.com/orhun/git-cliff/master/install.sh | sh -s -- -b ~/.local/bin
          echo "$HOME/.local/bin" >> $GITHUB_PATH
      - name: Generate changelog
        run: git-cliff -o CHANGELOG.md
      - name: Commit changelog
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add CHANGELOG.md
          git commit -m "chore: update CHANGELOG for $GITHUB_REF" || echo "no changes"
          git push origin HEAD:main
```

Conventional commit guidance (useful if you auto-generate)
- feat: A new feature
- fix: A bug fix
- docs: Documentation only changes
- style: Changes that do not affect the meaning of the code (formatting)
- refactor: A code change that neither fixes a bug nor adds a feature
- perf: A code change that improves performance
- test: Adding missing tests or correcting existing tests
- chore: Changes to the build process or auxiliary tools

Notes and next steps
- Run one of the recommended tools (git-cliff or github_changelog_generator) to convert your commit/PR history into concrete Unreleased entries.
- Review the generated changelog and move Unreleased entries into a versioned section when you cut a release.
- If you'd like, I can:
  - Generate changelog content from this repo's commit/PR history (I'll need read access to the repository or I can be instructed to run a specific tool and paste output), or
  - Create a GitHub Action workflow in this repo to auto-generate the changelog on tags/releases.
