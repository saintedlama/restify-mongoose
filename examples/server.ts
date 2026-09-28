import * as restify from 'restify';
import mongoose, { Schema } from 'mongoose';
import restifyMongoose from '../src/index';

type INote = {
  title: string;
  content?: string;
  tags?: string[];
  date: Date;
};

const NoteSchema = new Schema<INote>({
  title: { type: String, required: true },
  content: { type: String },
  tags: [{ type: String }],
  date: { type: Date, default: Date.now }
});

const Note = mongoose.model<INote>('Note', NoteSchema);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restify-mongoose-example');

  const server = restify.createServer({
    name: 'restify-mongoose-example',
    version: '1.0.0'
  });

  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());

  restifyMongoose<INote>(Note, {
    listProjection: async (_req: restify.Request, note: mongoose.HydratedDocument<INote>) => ({
      id: note._id,
      title: note.title,
      date: note.date
    }),
    beforeSave: async (_req: restify.Request, note: mongoose.HydratedDocument<INote>) => {
      if (!note.content) {
        note.content = 'Default note content';
      }
    }
  }).serve('/notes', server);

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`restify-mongoose example server listening on port ${port}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { Note, main };
