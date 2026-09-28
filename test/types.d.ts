declare module 'drop-mongodb-collections' {
  export default function dropMongodbCollections(uri: string): Promise<void>;
}
