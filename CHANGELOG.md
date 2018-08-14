# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="4.0.0"></a>
# [4.0.0](https://github.com/saintedlama/restify-mongoose/compare/v3.0.0...v4.0.0) (2018-08-14)



2.0.0 / 2017-04-07
==================

  * 2.0.0
  * Update changelog
  * Add changelog update task
  * Fix release script
  * Update dependencies
  * Fix order of test data creation
  * Convert to LF style
  * Mark typescript definiton as text
  * Add node.js 7 to build matrix
  * Merge pull request [#40](https://github.com/saintedlama/restify-mongoose/issues/40) from kolbma/master
    Added index.d.ts for TypeScript type checking
  * Added index.d.ts for TypeScript type checking

1.0.0 / 2016-06-11
==================

  * 1.0.0
  * Change release script to custom release script
  * Update dependencies and fix tests
  * [MAJOR] Add maxPageSize option and adapt breaking test
  * Modernize travis and add a couple of updated build targets
  * Implement cross platform tests with cross-env :tada
  * Merge pull request [#35](https://github.com/saintedlama/restify-mongoose/issues/35) from sergiofm/master
    default sort in options object
  * default sort in options object
  * Merge pull request [#33](https://github.com/saintedlama/restify-mongoose/issues/33) from sergiofm/master
    Select fields in the options object.
  * select fields in the options object.

0.2.6 / 2015-09-14
==================

  * Release v0.2.6.
  * Update CHANGELOG.md
    Updated for v2.6
  * Updated to latest versions: mocha, npm-release, should, supertest, mongoose and restify
  * Merge pull request [#27](https://github.com/saintedlama/restify-mongoose/issues/27) from mancvso/patch-1
    Update README.md
    Thanks, @mancvso !
  * Merge branch 'jmwohl-master'
  * Add test case when populate  option is NOT set
  * Update README.md
  * Updated populate docs in Readme
  * added docs
  * added populate options for resource and query/detail methods, along with corresponding tests
  * updated tests for populate queries
  * added populate param handling
  * Update README.md
    No explanation of the options object was in the documentation.
  * Add section about code style, tests and coverage when contributing
  * Make npm-release a dev dependency and add a npm release script and emit html from npm run cover
  * Merge pull request [#26](https://github.com/saintedlama/restify-mongoose/issues/26) from ismarslomic/master
    Documenting contribution guidelines
  * Updated  URL to devDependency badge in README
  * Fixed misspelling in README
  * Merge remote-tracking branch 'upstream/master'
  * [#25](https://github.com/saintedlama/restify-mongoose/issues/25) added contributing docs and release procedures to automate git and npm releases
  * Add NPM badge
  * Add dependency status badges
  * Merge pull request [#24](https://github.com/saintedlama/restify-mongoose/issues/24) from ismarslomic/master
    Move changelogs to CHANGELOG.md
  * Updated contributors list
  * Moved changelogs to CHANGELOG.md which follows same structure as angular and angular-material
  * Add node 0.12 and iojs as build targets

0.2.5 / 2015-07-02
==================

  * 0.2.5
  * Downgrade async again

0.2.4 / 2015-07-02
==================

  * 0.2.4
  * Update dependencies
  * Merge pull request [#22](https://github.com/saintedlama/restify-mongoose/issues/22) from ismarslomic/master
    Package upgrade. Last link. Total count. PageSize. Bug fix.
  * Merge branch 'master' of https://github.com/ismarslomic/restify-mongoose
  * bug fix: req.query.pageSize where persisted on server
  * Small README bug fixed to display Changelog correctly
  * Updated changelog in README for async v1.0.0
  * fixed jshint errors, added jshint dependency and 'lint' npm script command.
  * added 'last' link to the example in README
  * downgraded async dependency from v1.2.1 to v1.0.0 because 7 serve test cases where failing. It seems that changes introduced in async v1.1.0 leads to test fails.
  * Changed response code for POST from 200 to 201 according to RFC2616
  * Fixed bug in setLocationHeader() for PATCH, model._id was appended to URL even if existing.
    Added baseUrl to Location URL as well and added few more tests.
  * updated README with pageSize in query string having presendence
  * added pageSize as new query string parameter in order to set page sizes by URL as well.
  * fix missing single quote in README
  * added last relation in Link Header for URL to last page with results
  * updated to latest npm packages. Started documenting changelog for 0.3.0 version
  * added x-total-count header and added pagination chapter to README
  * Merge pull request [#21](https://github.com/saintedlama/restify-mongoose/issues/21) from yodlr/queryString
    Query string
  * Merge pull request [#1](https://github.com/saintedlama/restify-mongoose/issues/1) from saintedlama/master
    Bring in upstream changes

0.2.3 / 2015-03-08
==================

  * Update dependencies
  * Bump version
  * Merge pull request [#19](https://github.com/saintedlama/restify-mongoose/issues/19) from edsadr/output_format
    Adding a new option customizing the output format
  * Adding a new option customizing the output format with an option to be more compatible with http://jsonapi.org/format/, adding some docs about it too
  * add queryString
  * Merge pull request [#18](https://github.com/saintedlama/restify-mongoose/issues/18) from djensen47/patch-2
    Added a section in the README about projections
  * Added a section about projections
    Detailed instructions on how to use a projection.
  * Merge pull request [#17](https://github.com/saintedlama/restify-mongoose/issues/17) from mpareja/baseurl_paths
    Support base urls with paths.
  * Support base urls with paths.
  * Merge pull request [#16](https://github.com/saintedlama/restify-mongoose/issues/16) from mpareja/linkheaders
    Generate Link header with paging URLs.
  * Generate Link header with paging URLs.
  * Merge pull request [#15](https://github.com/saintedlama/restify-mongoose/issues/15) from mpareja/paging_tests
    Add tests for paging support
  * Retrofit pagination tests.
  * Add istanbul as dev dependency.
  * Updates dependencies

0.2.2 / 2014-05-24
==================

  * Merge pull request [#13](https://github.com/saintedlama/restify-mongoose/issues/13) from djensen47/master
    Added `beforeSave` as a constructor option
  * Added `beforeSave` as an option for the constructor.
    Previously `beforeSave` could only be set on the individual functions
    `insert` and update`. With this change, the caller need only provide it
    once to the constructor options and the beforeSave function will be
    invoked appropriately.
  * Updated README.md with more details about 0.2.1

0.2.1 / 2014-05-18
==================

  * Exclude editorconfig and jshintrc
  * Bump version
  * Improve error handling for mongoose validation errors
  * Remove http://localhost:3000 since it's superfluous
  * Move static middleware serving to end of middleware chain
  * Correct require
  * Simplify code for building handler chains
  * Adds tests to prove that before and after handlers can be passed as non arrays

0.2.0 / 2014-05-18
==================

  * Exclude coverage directory from npm package
  * Removes unused 'onError' function
  * Please jslint by adding a ;
  * Adds test for serve without before and after middleware
  * Adds change log entry for restify 2.8.x update
