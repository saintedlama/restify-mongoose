import * as restify from 'restify';
import restifyMongoose from '../../src/index';
import Note, { INote } from './note';

export type TestServer = restify.Server & {
  notes: restifyMongoose.Resource<INote>;
};

export default function createServer(options?: any, routes: boolean = true): TestServer {
  if (typeof options === 'boolean') {
    routes = options;
    options = undefined;
  }
  const server = restify.createServer({
    name: 'restify.mongoose.examples.notes',
    version: '1.0.0'
  }) as TestServer;

  server.use(restify.plugins.acceptParser(server.acceptable));
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());

  const notes = restifyMongoose<INote>(Note, options);

  // Serve model Notes as a REST API
  if (routes) {
    notes.serve('/notes', server);
  }

  server.notes = notes;

  return server;
}
