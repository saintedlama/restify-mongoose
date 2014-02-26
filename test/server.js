var restify = require('restify');
var restifyMongoose = require('../index');
var Note = require('./note');

var server = restify.createServer({
  name: 'restify.mongoose.examples.notes',
  version: '1.0.0'
});

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

var globalOptions = {};
var notes = restifyMongoose(Note, globalOptions);

// Serve model Notes as a REST API

server.get('/notes', notes.query());
server.get('/notes/:id', notes.detail());
server.post('/notes', notes.insert());
server.patch('/notes/:id', notes.update());
server.del('/notes/:id', notes.remove());

module.exports = server;
module.exports.globalOptions = globalOptions;
module.exports.Note = Note;
module.exports.notes = notes;
