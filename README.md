# Restify-Mongoose
[![Build Status](https://travis-ci.org/saintedlama/restify-mongoose.png?branch=master)](https://travis-ci.org/saintedlama/restify-mongoose)
[![Coverage Status](https://coveralls.io/repos/saintedlama/restify-mongoose/badge.png?branch=master)](https://coveralls.io/r/saintedlama/restify-mongoose?branch=master)

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

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

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

## Queries
Query parameters are passed by query string parameter __q__.

Query parameters are parsed as JSON objects and passed to [mongoose where query function](http://mongoosejs.com/docs/api.html#query_Query-where).

To filter a notes resource by title to match term "first" append the __q__ query parameter to the URL:

    http://localhost:3000/notes?q={"title":"first"}


## Sort
Sort parameters are passed by query string parameter __sort__.

Sort parameters are passed directly to [mongoose sort query function](http://mongoosejs.com/docs/api.html#query_Query-sort).

To sort a notes resource by title descending append the __sort__ query parameter to the URL:

    http://localhost:3000/notes?sort=-title

## Select Fields
To restrict selected columns you can pass a query string parameter __select__.

Select fields are passed directly to [mongoose select query function](http://mongoosejs.com/docs/api.html#query_Query-select).

To select only date the field of a notes resource append the __select__ query parameter to the URL:

    http://localhost:3000/notes?select=date
    
## Filter
Results can be filtered with a function, which is set in the options object of the constructor or on the `query` and `detail` function.

The function takes two parameters: the request object and the response object. The return value of the function is a query that is passed directly to the [mongoose where query function](http://mongoosejs.com/docs/api.html#query_Query-where).

For instance, you can use a filter to display only results for a particular user: 

```
var filterUser = function(req, res) {
  return {user: req.user};
}

var notes = restifyMongoose(Note, {filter: filterUser});
```

## Changelog

### 0.2.0

* Added `before` and `after` options to the `serve` function which pass arrays of handlers to the restify handler chain.
* Added `beforeSave` functionality to the **insert** and **update** operations.
* Added coverage script to package.json
* The insert and update operations now use aync.waterfall
* The server test helper has an optional parameter which will set or not set default routes 

### 0.2.1
* Updates to restify 2.8.x
* Updates to async 0.9.x
* Improved the error message for mongoose validation errors
* Code cleanup

### 0.2.2
* The `beforeSave` option can now be included in the options passed to the `restifyMongoose` constructor.
