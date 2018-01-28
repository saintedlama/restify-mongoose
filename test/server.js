const restify = require('restify');
const restifyMongoose = require('../index');
const Note = require('./note');

module.exports = function(options, routes) {
  if (routes === undefined) {
    routes = true;
  }
  if (typeof options === 'boolean') {
    routes = options;
  }
  const server = restify.createServer({
    name: 'restify.mongoose.examples.notes',
    version: '1.0.0'
  });

  server.use(restify.plugins.acceptParser(server.acceptable));
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());

  const notes = restifyMongoose(Note, options);

  // Serve model Notes as a REST API
  if (routes) {
    server.get('/notes', notes.query());
    server.get('/notes/:id', notes.detail());
    server.post('/notes', notes.insert());
    server.patch('/notes/:id', notes.update());
    server.del('/notes/:id', notes.remove());
  }

  server.notes = notes;

  return server;
};
