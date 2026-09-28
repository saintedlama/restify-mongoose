import mongoose from 'mongoose';

export type IAuthor = {
  name: string;
};

const AuthorSchema = new mongoose.Schema<IAuthor>({
  name: { type: String, required: true }
});

const Author = mongoose.models.author || mongoose.model<IAuthor>('author', AuthorSchema);

export default Author;
