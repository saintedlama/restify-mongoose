# Contribution Guideline
Contributions are welcome. Before sending a pull request:

* Conform to the project's code style: 2 spaces for indentation.
* Add tests for what you changed/added/fixed.
* Don't let code coverage drop - run `npm run coverage` to see current code coverage.
* Update README.md to document your changes.

## Install dependencies
    npm install

## Build
    npm run build

## Test
    npm test

## Coverage
    npm run coverage

## Lint
    npm run lint

## Release
Releases and publishing are automated through GitHub Actions using `release-please` and the [Publish workflow](.github/workflows/publish.yml).
When changes are merged into the default branch:
1. `release-please` creates or updates a release pull request tracking version bumps and changelog entries.
2. Merging the release PR creates a GitHub release and triggers the `publish.yml` workflow, which runs `npm run build` and publishes the package to npm.
