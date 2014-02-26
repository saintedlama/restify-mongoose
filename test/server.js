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
var options = {};

server.get('/notes', notes.query(options));
server.get('/notes/:id', notes.detail(options));
server.post('/notes', notes.insert(options));
server.patch('/notes/:id', notes.update(options));
server.del('/notes/:id', notes.remove(options));

module.exports = server;
module.exports.globalOptions = globalOptions;
module.exports.options = options;
module.exports.Note = Note;
module.exports.notes = notes;
