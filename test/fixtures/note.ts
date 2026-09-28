import mongoose from 'mongoose';

export type INote = {
  title: string;
  date: Date;
  tags?: string[];
  content?: string;
  author?: mongoose.Types.ObjectId;
  contributors?: mongoose.Types.ObjectId[];
};

const NoteSchema = new mongoose.Schema<INote>({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  tags: [String],
  content: { type: String },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'author'
  },
  contributors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'author'
  }]
});

const Note = mongoose.models.notes || mongoose.model<INote>('notes', NoteSchema);

export default Note;
