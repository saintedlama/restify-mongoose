<a name"0.2.6"></a>
### 0.2.6 (2015-09-11)

#### Features
* **populate:** Added populating referenced documents. Thanks to @jmwohl
* **option:** Added documentation about option sent to serve method. Thanks to @mancvso
* **Dependency upgrades:** Updated runtime and dev dependencies to latest versions
  * Updated to mongoose 4.1.6
  * Updated to restify 4.0.2
  * Updated to mocha 2.3.2
  * Updated to npm-release 0.0.4
  * Updated to should 7.1.0
  * Updated to supertest 1.1.0
  * Updated to istanbul 0.3.19

#### Breaking Changes
* None

#### Bug Fixes
* None

<a name"0.2.5"></a>
### 0.2.5 (2015-07-02)

#### Features
* **query:** Added total count of resources for `query` by adding `X-Total-Count header`
* **pagination:**
  * Added `last` relation in Link Header for showing URL to last page with results
  * Added `pageSize` as query string parameter in order to set page size for pagination in the URL itself
* **POST reponse status code:** Changed status code to `201 CREATED` for successful `POST` requests
* **Dependency upgrades:** Updated runtime and dev dependencies to latest versions
  * Updated to async 1.0.0
  * Updated to mongoose 4.0.6
  * Updated to restify 3.0.3
  * Updated to mocha 2.2.5
  * Updated to should 7.0.1
  * Updated to supertest 1.0.1
  * Updated to istanbul 0.3.16

#### Breaking Changes
* None

#### Bug Fixes
* **Header location:** Fixed bug when returning Location URL for `PATCH`, model._id was duplicated

<a name"0.2.2"></a>
### 0.2.2 (2015-05-19)

#### Features
* **beforeSave:** The `beforeSave` option can now be included in the options passed to the `restifyMongoose` constructor.

#### Breaking Changes
* None

#### Bug Fixes
* None

<a name"0.2.1"></a>
### 0.2.1 (2015-05-18)

#### Features
* **Dependency upgrades:** Updated runtime and dev dependencies to latest versions
  * Updates to restify 2.8.x
  * Updates to async 0.9.x
* **Validation errors:** Improved the error message for mongoose validation errors
* Code cleanup

#### Breaking Changes
* None

#### Bug Fixes
* None

<a name"0.2.0"></a>
### 0.2.0 (2015-05-18)

#### Features
* **Restify handler chains:** Added `before` and `after` options to the `serve` function which pass arrays of handlers to the restify handler chain.
* **beforeSave:** Added `beforeSave` functionality to the **insert** and **update** operations.
* **Coverage:** Added coverage script to package.json
* **Use async:** The insert and update operations now use async.waterfall
* **Improve tests:** The server test helper has an optional parameter which will set or not set default routes

#### Breaking Changes
* None

#### Bug Fixes
* None
