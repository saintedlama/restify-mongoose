# Restify-Mongoose
[![NPM](https://nodei.co/npm/restify-mongoose.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/restify-mongoose/)

[![CI](https://github.com/saintedlama/restify-mongoose/actions/workflows/ci.yml/badge.svg)](https://github.com/saintedlama/restify-mongoose/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/restify-mongoose.svg)](https://www.npmjs.com/package/restify-mongoose)
[![npm downloads](https://img.shields.io/npm/dm/restify-mongoose.svg)](https://www.npmjs.com/package/restify-mongoose)
[![License](https://img.shields.io/npm/l/restify-mongoose.svg)](https://github.com/saintedlama/restify-mongoose/blob/master/LICENSE)

Restify-Mongoose provides a resource abstraction for [restify](http://mcavage.me/node-restify/) to expose mongoose models as REST resources.

## Getting started
First you'll need to install restify-mongoose via npm

    npm install restify-mongoose

Second step is to wire up mongoose and restify using restify-mongoose

```javascript
var restify = require('restify');
var restifyMongoose = require('restify-mongoose');
var mongoose = require('mongoose');

var server = restify.createServer({
    name: 'restify.mongoose.examples.notes',
    version: '1.0.0'
});

server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());

// Create a simple mongoose model 'Note'
var NoteSchema = new mongoose.Schema({
    title : { type : String, required : true },
    date : { type : Date, required : true },
    tags : [String],
    content : { type: String }
});

var Note = mongoose.model('notes', NoteSchema);

// Now create a restify-mongoose resource from 'Note' mongoose model
var notes = restifyMongoose(Note);

// Serve resource notes with fine grained mapping control
server.get('/notes', notes.query());
server.get('/notes/:id', notes.detail());
server.post('/notes', notes.insert());
server.patch('/notes/:id', notes.update());
server.del('/notes/:id', notes.remove());

server.listen(3000, function () {
    console.log('%s listening at %s', server.name, server.url);
});
```

# Resources
To map resources or resource functionality to restify REST endpoints/routes restify-mongoose offers
two approaches:

* 'fine grained mapping' control via list, detail, new, update and delete functions
* 'quick mapping' via serve method

__Fine grained mapping__
In the above getting started example we used fine grained mapping control. Restify-mongoose defines the functions `query`,
`detail`, `insert`, `update` and `remove` that return restify route handlers and can be used like this:

```javascript
 // Serve resource notes with fine grained mapping control
 server.get('/notes', notes.query());
 server.get('/notes/:id', notes.detail());
 server.post('/notes', notes.insert());
 server.patch('/notes/:id', notes.update());
 server.del('/notes/:id', notes.remove());
```

For every ´id´ dependent function the restify route has to define a `:id` placeholder to allow restify-mongoose to access
id parameters. Id dependent functions are `detail`, `update` and `delete`.

__Query String__

Setting a `queryString` will make restify-mongoose use the string as the field name to conduct its searches in the `detail` `update` & `remove` functions.
If not set it will use the default behavior of using mongos `_id` field.

```javascript
// Now create a restify-mongoose resource from 'Note' mongoose model and set queryString to 'myField'
var notes = restifyMongoose(Note, {queryString: 'myField'});

// these functions will now conduct searches with the field 'myField'. (defaults to '_id')
server.get('/notes/:id', notes.detail());
server.patch('/notes/:id', notes.update());
server.del('/notes/:id', notes.remove());
```

__Quick mapping__

```javascript
// Serve resource notes with quick mapping
restifyMongoose(models.Note).serve('/api/notes', server);
```

Maps urls

* GET '/api/notes' to `query` function
* GET '/api/notes/:id' to `detail` function
* POST '/api/notes' to `insert` function
* DELETE '/api/notes/:id' to `remove` function
* PATCH '/api/notes/:id' to `update` function

You can also pass an options object to the `serve` method to attach handlers before and after the request.
For example, to use [restify-jwt](https://github.com/auth0/express-jwt):

```javascript
// Serve resource notes with quick mapping with JWT auth
restifyMongoose(models.Note).serve('/api/notes', server, { before: jwt({secret: 'some-secret'}) } );
```

## Queries
Query parameters are passed by query string parameter __q__.

Query parameters are parsed as JSON objects and passed to [mongoose where query function](http://mongoosejs.com/docs/api.html#query_Query-where).

To filter a notes resource by title to match term "first" append the __q__ query parameter to the URL:

    http://localhost:3000/notes?q={"title":"first"}

### Query Security & Sanitization

By default, `restify-mongoose` operates on a **whitelist-first** security model to protect against NoSQL injection:
* **Object & Prototype Safety**: Queries must parse into a valid JSON object. Prototype pollution keys (`__proto__`, `constructor`, `prototype`) and non-object payloads are rejected with HTTP 400.
* **Default Operator Whitelist**: Only safe, standard query operators are permitted by default:
  - Comparison: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
  - Logical: `$and`, `$or`, `$not`, `$nor`
  - Element: `$exists`, `$type`
  - Array: `$all`, `$elemMatch`, `$size`
  - Evaluation: `$regex`, `$options`
* **Default Deny**: Any operator not in the whitelist (e.g. `$where`, `$expr`, `$function`, `$accumulator`, or unknown operators) is rejected with HTTP 400.

#### Customizing Allowed Operators (`queryOperators`)

You can customize which query operators are permitted at the resource or query route level:

* **Default**: Standard whitelist of safe comparison, logical, and array operators.
* `string[]`: Custom whitelist specifying exactly which operators are allowed.
* `'none'` or `false`: Strict mode — disallows **all** `$` operators (allowing only direct key-value matching).
* `'all'` or `true`: Unrestricted mode — permits any MongoDB query operator.

```typescript
import restifyMongoose, { DEFAULT_ALLOWED_OPERATORS } from 'restify-mongoose';

// Strict mode: disallow all MongoDB operators
const notes = restifyMongoose(Note, { queryOperators: 'none' });

// Custom whitelist: only allow specific operators
const notes = restifyMongoose(Note, {
  queryOperators: ['$gt', '$gte', '$lt', '$lte', '$in']
});

// Extend default whitelist with additional operators
const notes = restifyMongoose(Note, {
  queryOperators: [...DEFAULT_ALLOWED_OPERATORS, '$text']
});

// Or configure per-route
server.get('/notes', notes.query({ queryOperators: false }));
```

#### Restricting Queryable Fields (`queryFields`)

To prevent clients from querying internal or sensitive fields, specify an allowed fields list as an array or comma-separated string:

```typescript
// Only allow queries on title and date
const notes = restifyMongoose(Note, {
  queryFields: ['title', 'date']
});

// Or as a comma-separated string
server.get('/notes', notes.query({ queryFields: 'title,date' }));
```

## Paginate
Requests that return multiple items in `query` will be paginated to 100 items by default. You can set the `pageSize`
(number min=1) by adding it to the options.

```javascript
var options = {
	pageSize: 2
};

var notes = restifyMongoose(Note, options);
```

or as query string parameter `pageSize` (which will have the presedence)

    http://localhost:3000/notes?pageSize=2


You can specify further pages with the __p__ parameter and a page number.

    http://localhost:3000/notes?p=1

An additional restriction to page sizes can be made with `maxPageSize` option (default value is 100) that defines the
maximum allowed page size to avoid unbound queries.

### Link Header
The pagination info is included in [the Link header](http://tools.ietf.org/html/rfc5988). It is important to follow
these Link header values instead of constructing your own URLs.

    link:
    <http://example.com/notes?p=0>; rel="first",
    <http://example.com/notes?p=1>; rel="prev",
    <http://example.com/notes/?p=3>; rel="next",
    <http://example.com/notes/?p=4>; rel="last"

_Linebreak is included for readability._

You can set the `baseUrl` by adding it to the options.

```javascript
var options = {
	baseUrl: 'http://example.com'
};
```

The possible `rel` values are:

* ***next*** - Shows the URL of the immediate next page of results.
* ***last*** - Shows the URL of the last page of results.
* ***first*** - Shows the URL of the first page of results.
* ***prev*** - Shows the URL of the immediate previous page of results.

### Total Count Header
The total number of results/resources returned in `query` is sent in the `X-Total-Count Header` and is not affected by
pagination (setting `pageSize` and __p__ parameter). It does take in account filter and query parameter ( __q__ ).

## Sort
Sort parameters are passed by query string parameter __sort__.

Sort parameters can be separated by comma or space. They will be passed directly to [mongoose sort query function](http://mongoosejs.com/docs/api.html#query_Query-sort).

To sort a notes resource by title descending append the __sort__ query parameter to the URL:

    http://localhost:3000/notes?sort=-title

You can also define a default sort in the options object. This option will by ignored if a __sort__ query parameter exists.

Using in the constructor:
```javascript
var notes = restifyMongoose(Note, {sort: '-title'});
notes.serve('/notes', restifyServer);
```

Using for query or detail methods:
```javascript
var notes = restifyMongoose(Note);
note.query({sort: '-title'});

## Select Fields
To restrict selected columns you can pass a query string parameter __select__.

Select fields can be separated by comma or space. They will be passed to [mongoose select query function](http://mongoosejs.com/docs/api.html#query_Query-select).

To select only title and date the fields of a notes resource append the __select__ query parameter to the URL:

    http://localhost:3000/notes?select=title,date

You can also define select fields in the options object. This will make the the __select__ query parameter be ignored.

Using in the constructor:
```javascript
var notes = restifyMongoose(Note, {select: 'title'});
notes.serve('/notes', restifyServer);
```

Using for query or detail methods:
```javascript
var notes = restifyMongoose(Note);
note.detail({select: 'title,date,tags'});
note.query({select: 'title date'});
```

## Filter
Results can be filtered with a function, which is set in the options object of the constructor or on the `query` and `detail` function.

The function takes two parameters: the request object and the response object. The return value of the function is a query that is passed directly to the [mongoose where query function](http://mongoosejs.com/docs/api.html#query_Query-where).

For instance, you can use a filter to display only results for a particular user:

```javascript
var filterUser = function(req, res) {
  return {user: req.user};
}

var notes = restifyMongoose(Note, {filter: filterUser});
```

## Projection

A projection is a function, used by the `query` and `detail` operations, which takes the request object, the result model, and a callback. This function should invoke the callback exactly once. This callback takes an error and a model item as it's two parameters. Use `null` for the error is there is no error.

For instance, the default detail and list projections are as follows:

```javascript
function (req, item, cb) {
  cb(null, item);
};
```

A projection is useful if you need to manipulate the result item before returning it in the response. For instance, you may not want to return the passwordHash for a User data model.

```javascript
// If this is the schema
var UserSchema = new Schema({
  username: String,
  email: String,
  passwordHash: String
});

// This is a projection translating _id to id and not including passwordHash
var userProjection = function(req, item, cb) {
  var user = {
    id: item._id,
    username: item.username,
    email: item.email
  };
  cb(null, user);
};
```

Projection functions are specified in the options for the resitfy-mongoose contructor, the query function, or the detail function.

For the construtor, the options are `listProjection` and `detailProjection`

```javascript
var users = restifyMongoose(User, {listProjection: userProjection, detailProjection: userProjection});
users.serve('/users', restifyServer);
```

For both query and detail, the option is `projection`
var users = restifyMongoose(User);

```javascript
users.detail({projection: userProjection});
users.query({projection: userProjection});
```
## Output format

The output format can be changed to a more compatible one with the [json-api](http://jsonapi.org/format/) standard to use the API with frameworks like Ember.

```javascript
var users = restifyMongoose(User, {outputFormat: 'json-api'});
users.serve('/users', restifyServer);
```
Also you can specify a custom model name like this:

```javascript
var users = restifyMongoose(User, {outputFormat: 'json-api', modelName: 'admins'});
users.serve('/users', restifyServer);
```

## Populating referenced documents

The returned results can use mongoose's "populate" query modifier to populated referenced documents within models.

Referenced documents can be populated in three ways:

#### query parameter
Adding `populate=[referenced_field]` to the query string will populate the `referenced_field`, if it exists.

#### Resource option
```javascript
// e.g.
var notes = restifyMongoose(Note, {populate: 'author'});
```

#### query / detail method options
```javascript
// e.g.
server.get('/notes', notes.query({populate: 'author'}))
server.get('/notes/:id', notes.detail({populate: 'author'}))
```

### Populating multiple fields
Multiple referenced documents can be populated by using a comma-delimited list of the desired fields in any of the three methods above.
```javascript
// e.g.
var notes = restifyMongoose(Note, {populate: 'author,contributors'});
```

# Contribute
Contribution welcome! Read the [contribution guideline](contributing.md) first.
