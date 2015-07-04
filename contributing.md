# Contribution Guideline

## Install dependencies
    npm install
    npm install -g npm-release
    npm install -g istanbul
    npm install coveralls
    npm install mocha-lcov-reporter

## Test
    npm test

## Coverage
    npm run cover

## Lint
    npm run lint

## Release
Use the `npm-release` module as described below. It will bump version in `package.json` and release new version in git and npm.

Remember to update [CHANGELOG.md](CHANGELOG.md) **before** release.

    npm-release [<newversion> | major | minor | patch | build] -m "<release message>"


Command above enforce the use of [semantic versions](http://semver.org/) when releasing:

Given a version number MAJOR.MINOR.PATCH, increment the:

* **MAJOR** version when you make incompatible API changes,
* **MINOR** version when you add functionality in a backwards-compatible manner, and
* **PATCH** version when you make backwards-compatible bug fixes.
Additional labels for pre-release and build metadata are available as extensions to the MAJOR.MINOR.PATCH format.
