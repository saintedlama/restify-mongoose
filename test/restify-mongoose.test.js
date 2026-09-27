import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import restifyMongoose from '../index.js';
import server from './fixtures/server.js';
import Note from './fixtures/note.js';
import Author from './fixtures/author.js';
import dropMongodbCollections from 'drop-mongodb-collections';

const MONGO_URI = 'mongodb://localhost:27017/restify-mongoose-tests';

describe('restify-mongoose', function () {
  describe('constructor', function () {
    it('should throw if no model is given', function () {
      expect(function () {
        restifyMongoose();
      }).toThrow(/Model argument/);
    });
  });

  describe('query', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));

    beforeEach(async function () {
      const authors = await Author.create([
        { name: 'Test Testerson' },
        { name: 'Conny Contributor' },
        { name: 'Conrad Contributor' }
      ]);

      await Note.create([
        {
          title: 'first',
          date: new Date(),
          author: authors[0]._id,
          contributors: [authors[1]._id, authors[2]._id]
        },
        { title: 'second', date: new Date() },
        { title: 'third', date: new Date() }
      ]);
    });

    afterEach(() => mongoose.disconnect());

    it('should return all notes', async function () {
      const res = await request(server())
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(3);
    });

    it('should filter notes according to query', async function () {
      const res = await request(server())
        .get('/notes?q={"title":"first"}')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('first');
    });

    it('should not populate resources with referenced models by default', async function () {
      const res = await request(server())
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(3);
      const containsPopulatedAuthors = res.body.some(post => typeof post.author === 'object' && post.author !== null && post.author.name);
      expect(containsPopulatedAuthors).toBe(false);
    });

    it('should populate resources with referenced models according to populate query param', async function () {
      const res = await request(server())
        .get('/notes?populate=author')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(3);
      expect(containsAuthor(res.body, 'Test Testerson')).toBe(true);
    });

    it('should populate resources with multiple referenced models according to comma-delimited populate query param', async function () {
      const res = await request(server())
        .get('/notes?populate=author,contributors')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(3);
      expect(containsContributor(res.body, 'Conny Contributor')).toBe(true);
    });

    it('should populate resources with referenced models according to populate resource option', async function () {
      const res = await request(server({ populate: 'author' }))
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(3);
      expect(containsAuthor(res.body, 'Test Testerson')).toBe(true);
    });

    it('should populate resources with referenced models according to populate query method option', async function () {
      const notes = restifyMongoose(Note);
      const svr = server(null, false);
      svr.get('/notes', notes.query({ populate: 'author' }));

      const res = await request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(3);
      expect(containsAuthor(res.body, 'Test Testerson')).toBe(true);
    });

    it('should fail on invalid query', async function () {
      await request(server())
        .get('/notes?q={title"first"}')
        .expect('Content-Type', /json/)
        .expect(400);
    });

    it('should filter notes according to options', async function () {
      const svr = server({
        filter: function () {
          return { title: 'second' };
        }
      });

      const res = await request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('second');
    });

    it('should sort notes', async function () {
      const res = await request(server())
        .get('/notes?sort=-title')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body[0].title).toBe('third');
      expect(res.body[1].title).toBe('second');
      expect(res.body[2].title).toBe('first');
    });

    it('should sort notes according to options', async function () {
      const res = await request(server({ sort: '-title' }))
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body[0].title).toBe('third');
      expect(res.body[1].title).toBe('second');
      expect(res.body[2].title).toBe('first');
    });

    it('should sort notes according to query, overriding options', async function () {
      const res = await request(server({ sort: 'title' }))
        .get('/notes?sort=-title')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body[0].title).toBe('third');
      expect(res.body[1].title).toBe('second');
      expect(res.body[2].title).toBe('first');
    });

    it('should select fields of notes', async function () {
      const res = await request(server())
        .get('/notes?select=date')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body[0]).not.toHaveProperty('title');
      expect(res.body[1]).not.toHaveProperty('title');
      expect(res.body[2]).not.toHaveProperty('title');
    });

    it('should select fields of notes according to options', async function () {
      const res = await request(server({ select: 'title' }))
        .get('/notes?select=date')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body[0]).toHaveProperty('title');
      expect(res.body[0]).not.toHaveProperty('date');
      expect(res.body[1]).toHaveProperty('title');
      expect(res.body[1]).not.toHaveProperty('date');
      expect(res.body[2]).toHaveProperty('title');
      expect(res.body[2]).not.toHaveProperty('date');
    });

    it('should emit event after querying notes', async function () {
      const svr = server();

      let eventEmitted;
      let eventArg;
      svr.notes.on('query', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      await request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(eventEmitted).toBeTruthy();
      expect(eventArg).toBeTruthy();
    });
  });

  describe('pagination', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    beforeEach(() => Note.create([
      { title: 'first', content: 'a', date: new Date() },
      { title: 'second', content: 'a', date: new Date() },
      { title: 'third', content: 'a', date: new Date() },
      { title: 'forth', content: 'b', date: new Date() },
      { title: 'fifth', content: 'b', date: new Date() }
    ]));

    afterEach(() => mongoose.disconnect());

    it('should limit notes returned to pageSize', async function () {
      const res = await request(server({ pageSize: 2 }))
        .get('/notes')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should split pages by pageSize', async function () {
      const res = await request(server({ pageSize: 2 }))
        .get('/notes?p=2')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('should use req.query.pageSize if positive number', async function () {
      const res = await request(server())
        .get('/notes?pageSize=3')
        .expect(200);

      expect(res.body).toHaveLength(3);
    });

    it('should not execute queries with req.query.pageSize above maxPageSize option', async function () {
      const res = await request(server({ pageSize: 1, maxPageSize: 2 }))
        .get('/notes?pageSize=3')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should override with req.query.pageSize if options.pageSize set', async function () {
      const res = await request(server({ pageSize: 1 }))
        .get('/notes?pageSize=3')
        .expect(200);

      expect(res.body).toHaveLength(3);
    });

    it('should go back to options.pageSize if req.query.pageSize removed', async function () {
      const svr = server({ pageSize: 1 });
      await request(svr).get('/notes?pageSize=3');
      const res = await request(svr)
        .get('/notes')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('should not use req.query.pageSize if greater then maxPageSize', async function () {
      const res = await request(server({ pageSize: 1, maxPageSize: 2 }))
        .get('/notes?pageSize=101')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should not use req.query.pageSize if lower then 0', async function () {
      const res = await request(server({ pageSize: 2 }))
        .get('/notes?pageSize=-1')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should not use req.query.pageSize if not a number', async function () {
      const res = await request(server({ pageSize: 2 }))
        .get('/notes?pageSize=abcd')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should not use req.query.pageSize if it is 0', async function () {
      const res = await request(server({ pageSize: 2 }))
        .get('/notes?pageSize=0')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    function assertFirstPage(suffix) {
      return async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes' + suffix)
          .expect(200);

        expect(res.body[0].title).toBe('first');
        expect(res.body[1].title).toBe('second');
      };
    }

    it('should respond with first page given no page parameter', assertFirstPage('?sort=_id'));
    it('should respond with first page given blank page parameter', assertFirstPage('?sort=_id&p='));
    it('should respond with first page given invalid page parameter', assertFirstPage('?sort=_id&p=abcd'));
    it('should respond with first page given negative page number', assertFirstPage('?sort=_id&p=-123'));

    describe('total count header', function () {
      function assertTotalCount(expectedResult, options, queryString) {
        return async function () {
          const res = await request(server(options))
            .get('/notes' + queryString)
            .expect(200);

          expect(res.headers).toHaveProperty('x-total-count');
          expect(res.headers['x-total-count']).toBe(expectedResult);
        };
      }

      it('should return total count of models if no pagination used', assertTotalCount('5', '', ''));
      it('should return total count of models if pageSize set but no page selected', assertTotalCount('5', { pageSize: 2 }, ''));
      it('should return total count of models if pageSize set and page selected', assertTotalCount('5', { pageSize: 2 }, '?p=1'));
      it('should return total count of models if query is used', assertTotalCount('3', '', '?q={"content":"a"}'));

      it('should return total count of models if filtering is used', async function () {
        const svr = server({
          filter: function () {
            return { title: 'second' };
          }
        });

        const res = await request(svr)
          .get('/notes')
          .expect(200);

        expect(res.headers).toHaveProperty('x-total-count');
        expect(res.headers['x-total-count']).toBe('1');
      });

      it('should not return total count of models when querying details', async function () {
        const note = await Note.create({
          title: 'detailtitle',
          date: new Date(),
          tags: ['a', 'b', 'c'],
          content: 'Content'
        });

        const res = await request(server())
          .get('/notes/' + note.id)
          .expect(200);

        expect(res.headers).not.toHaveProperty('x-total-count');
      });
    });

    describe('link header', function () {
      it('should include link header with url to next page if more pages', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=1')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=2>; rel="next"/);
      });

      it('should preserve query parameters across urls in link header', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?q={"content":"a"}')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(new RegExp('<http://example\\.com/notes\\?q=' + encodeURIComponent('{"content":"a"}') + '&p=1>; rel="next"'));
      });

      it('should not include next page url in link header if no more pages', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=2')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).not.toMatch(/rel="next"/);
      });

      it('should include previous page url in link header if not at first page', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=2')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=1>; rel="prev"/);
      });

      it('should not include previous page url in link header if already at first page', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=0')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).not.toMatch(/rel="prev"/);
      });

      it('should include first page url in link header', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=0')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=0>; rel="first"/);
      });

      it('should support multiple links in link header', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=1')
          .expect(200);

        expect(res.headers.link).toMatch(/rel="first", <http/);
        expect(res.headers.link).toMatch(/rel="prev", <http/);
      });

      it('should include base url paths in link header urls', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com/v1' }))
          .get('/notes?p=0')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/v1\/notes\?p=0>; rel="first"/);
      });

      it('should include last page url in link header if at first page', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=0')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=2>; rel="last"/);
      });

      it('should include last page url in link header if not at first page', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=1')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=2>; rel="last"/);
      });

      it('should include last page url in link header if at last page', async function () {
        const res = await request(server({ pageSize: 2, baseUrl: 'http://example.com' }))
          .get('/notes?p=2')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=2>; rel="last"/);
      });

      it('should include last page url in link header if page size set to 0', async function () {
        const res = await request(server({ pageSize: 0, baseUrl: 'http://example.com' }))
          .get('/notes?p=2')
          .expect(200);

        expect(res.headers).toHaveProperty('link');
        expect(res.headers.link).toMatch(/<http:\/\/example\.com\/notes\?p=0>; rel="last"/);
      });
    });
  });

  describe('detail', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should select detail note', async function () {
      const note = await Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const res = await request(server())
        .get('/notes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.title).toBe('detailtitle');
    });

    it('should select detail note according to options', async function () {
      const note = await Note.create({
        title: 'detailtitleselect',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content Select'
      });

      const res = await request(server({ select: 'title content' }))
        .get('/notes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.title).toBe('detailtitleselect');
      expect(res.body.content).toBe('Content Select');
      expect(res.body).not.toHaveProperty('date');
      expect(res.body).not.toHaveProperty('tags');
    });

    it('should respond with 404 if not found', async function () {
      const id = new mongoose.Types.ObjectId();

      await request(server())
        .get('/notes/' + id.toString())
        .expect('Content-Type', /json/)
        .expect(404);
    });

    it('should filter notes according to options', async function () {
      const note = await Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server({
        filter: function () {
          return { title: 'doesNotExists' };
        }
      });

      await request(svr)
        .get('/notes/' + note.id)
        .expect(404);
    });

    it('should populate resources with referenced models according to populate query param', async function () {
      const author = await Author.create({
        name: 'Test Testerson'
      });

      const note = await Note.create({
        title: 'detailtitle',
        date: new Date(),
        author: author.id
      });

      const res = await request(server())
        .get('/notes/' + note.id + '?populate=author')
        .expect(200);

      expect(res.body.author.name).toBe('Test Testerson');
    });

    it('should populate resources with referenced models according to populate detail method option', async function () {
      const notes = restifyMongoose(Note);
      const svr = server(null, false);
      svr.get('/notes/:id', notes.detail({ populate: 'author' }));

      const author = await Author.create({
        name: 'Test Testerson'
      });

      const note = await Note.create({
        title: 'detailtitle',
        date: new Date(),
        author: author.id
      });

      const res = await request(svr)
        .get('/notes/' + note.id)
        .expect(200);

      expect(res.body.author.name).toBe('Test Testerson');
    });

    it('should emit event after selecting a note detail', async function () {
      const note = await Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server();

      let eventEmitted;
      let eventArg;
      svr.notes.on('detail', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      await request(svr)
        .get('/notes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(eventEmitted).toBeTruthy();
      expect(eventArg).toBeTruthy();
    });
  });

  describe('insert', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should create note', async function () {
      const res = await request(server())
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
    });

    it('should create note with beforeSave', async function () {
      const svr = server(false);
      const content = 'Specifically buy a soprano ukulele, the most common kind.';
      const opts = {
        beforeSave: function (req, model, cb) {
          model.content = content;
          cb();
        }
      };
      svr.post('/notes', svr.notes.insert(opts));

      const res = await request(svr)
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
      expect(res.body.content).toBe(content);
    });

    it('should respond with 400 if not valid', async function () {
      const res = await request(server())
        .post('/notes')
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.headers).not.toHaveProperty('location');
    });

    it('should emit event after inserting a note', async function () {
      const svr = server();

      let eventEmitted;
      let eventArg;
      svr.notes.on('insert', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      await request(svr)
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(eventEmitted).toBeTruthy();
      expect(eventArg).toBeTruthy();
    });

    it('should return location URL including baseUrl if baseUrl defined in options', async function () {
      const res = await request(server({ baseUrl: 'http://example.com' }))
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
      expect(res.headers.location).toBe('http://example.com/notes/' + res.body._id);
    });

    it('should return location URL without baseUrl if baseUrl missing in options', async function () {
      const res = await request(server())
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
      expect(res.headers.location).toBe('/notes/' + res.body._id);
    });
  });

  describe('update', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should update existing note', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const res = await request(server())
        .patch('/notes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.headers).toHaveProperty('location');
    });

    it('should update existing note with beforeSave', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server(false);
      const content = 'Specifically buy a soprano ukulele, the most common kind.';
      const opts = {
        beforeSave: function (req, model, cb) {
          model.content = content;
          cb();
        }
      };
      svr.patch('/notes/:id', svr.notes.update(opts));

      const res = await request(svr)
        .patch('/notes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.headers).toHaveProperty('location');
      expect(res.body.content).toBe(content);
    });

    it('should fail on invalid content', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const res = await request(server())
        .patch('/notes/' + note.id)
        .send()
        .expect(400);

      expect(res.headers).not.toHaveProperty('location');
    });

    it('should respond with 404 if not found', async function () {
      const id = new mongoose.Types.ObjectId();

      const res = await request(server())
        .patch('/notes/' + id.toString())
        .send({ title: 'Buy a guitar' })
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.headers).not.toHaveProperty('location');
    });

    it('should filter notes according to options', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server({
        filter: function () {
          return { title: 'doesNotExists' };
        }
      });

      const res = await request(svr)
        .patch('/notes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect(404);

      expect(res.headers).not.toHaveProperty('location');
    });

    it('should emit event after updating a note', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server();

      let eventEmitted;
      let eventArg;
      svr.notes.on('update', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      const res = await request(svr)
        .patch('/notes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.headers).toHaveProperty('location');
      expect(res.headers.location).toBe('/notes/' + note.id);
      expect(eventEmitted).toBeTruthy();
      expect(eventArg).toBeTruthy();
    });

    it('should return location URL including baseUrl if baseUrl defined in options', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const res = await request(server({ baseUrl: 'http://example.com' }))
        .patch('/notes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.headers).toHaveProperty('location');
      expect(res.headers.location).toBe('http://example.com/notes/' + res.body._id);
    });

    it('should return location URL without baseUrl if baseUrl missing in options', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const res = await request(server())
        .patch('/notes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.headers).toHaveProperty('location');
      expect(res.headers.location).toBe('/notes/' + res.body._id);
    });
  });

  describe('delete', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should delete existing note', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      await request(server())
        .del('/notes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);
    });

    it('should respond with 404 if not found', async function () {
      const id = new mongoose.Types.ObjectId();

      await request(server())
        .del('/notes/' + id.toString())
        .send({ title: 'Buy a guitar' })
        .expect('Content-Type', /json/)
        .expect(404);
    });

    it('should filter notes according to options', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server({
        filter: function () {
          return { title: 'doesNotExists' };
        }
      });

      await request(svr)
        .del('/notes/' + note.id)
        .expect(404);
    });

    it('should emit event after deleting a note', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server();

      let eventEmitted;
      let eventArg;
      svr.notes.on('remove', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      await request(svr)
        .del('/notes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(eventEmitted).toBeTruthy();
      expect(eventArg).toBeTruthy();
    });
  });

  describe('serve', function () {
    const generateOptions = function (beforeCalled, afterCalled) {
      return {
        before: [function (req, res, next) {
          beforeCalled[0] = true;
          next();
        }, function (req, res, next) {
          beforeCalled[1] = true;
          next();
        }],
        after: [function (req, res, next) {
          afterCalled[0] = true;
          next();
        }, function (req, res, next) {
          afterCalled[1] = true;
          next();
        }]
      };
    };

    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should return query notes', async function () {
      await Note.create({
        title: 'some new note',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      const res = await request(svr)
        .get('/servenotes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should select detail note', async function () {
      const note = await Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      const res = await request(svr)
        .get('/servenotes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.title).toBe('detailtitle');
      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should create note', async function () {
      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      const res = await request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should create note with beforeSave', async function () {
      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svrOptions = {};
      const content = 'Specifically buy a soprano ukulele, the most common kind.';
      svrOptions.beforeSave = function (req, model, cb) {
        model.content = content;
        cb();
      };

      const svr = server(svrOptions, false);
      svr.notes.serve('/servenotes', svr, options);

      const res = await request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
      expect(res.body.content).toBe(content);
      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should update existing note', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      await request(svr)
        .patch('/servenotes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should update existing note with beforeSave', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svrOptions = {};
      const content = 'Specifically buy a soprano ukulele, the most common kind.';
      svrOptions.beforeSave = function (req, model, cb) {
        model.content = content;
        cb();
      };

      const svr = server(svrOptions, false);
      svr.notes.serve('/servenotes', svr, options);

      const res = await request(svr)
        .patch('/servenotes/' + note.id)
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.content).toBe(content);
      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should delete existing note', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const beforeCalled = [false, false];
      const afterCalled = [false, false];
      const options = generateOptions(beforeCalled, afterCalled);

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      await request(svr)
        .del('/servenotes/' + note.id)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(beforeCalled).toEqual([true, true]);
      expect(afterCalled).toEqual([true, true]);
    });

    it('should not require "before" or "after" middleware', async function () {
      const svr = server(false);
      svr.notes.serve('/servenotes', svr, {});

      const res = await request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele without middleware', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
    });

    it('should allow to pass a single "before" middleware as non array', async function () {
      let beforeCalled = false;

      const options = {
        before: function (req, res, next) {
          beforeCalled = true;
          next();
        }
      };

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      await request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(beforeCalled).toBe(true);
    });

    it('should allow to pass a single "after" middleware as non array', async function () {
      let afterCalled = false;

      const options = {
        after: function (req, res, next) {
          afterCalled = true;
          next();
        }
      };

      const svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      await request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(afterCalled).toBe(true);
    });
  });

  describe('output formats', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should return json-api format if defined in options', async function () {
      const res = await request(server({ outputFormat: 'json-api' }))
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.headers).toHaveProperty('location');
      expect(res.body).toHaveProperty('notes');
      expect(res.body.notes.title).toBe('Buy a ukulele');
    });
  });

  describe('errors', function () {
    beforeEach(() => dropMongodbCollections(MONGO_URI));
    beforeEach(() => mongoose.connect(MONGO_URI));
    afterEach(() => mongoose.disconnect());

    it('should serve mongoose validation errors as errors property in body for create', async function () {
      const res = await request(server())
        .post('/notes')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body.message).toBeTruthy();
      expect(res.body.errors).toBeTruthy();
      expect(res.body.errors.date).toBeTruthy();
      expect(res.body.errors.title).toBeTruthy();
    });

    it('should serve mongoose validation errors as errors property in body for update', async function () {
      const note = await Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      });

      const svr = server(false);
      svr.notes.serve('/servenotes', svr);

      const res = await request(svr)
        .patch('/servenotes/' + note.id)
        .send({ title: '', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body.message).toBeTruthy();
      expect(res.body.errors).toBeTruthy();
      expect(res.body.errors.title).toBeTruthy();
    });
  });
});

function containsAuthor(posts, name) {
  return posts.some(post => post.author && post.author.name === name);
}

function containsContributor(posts, name) {
  return posts.some(post => post.contributors && post.contributors.some(contributor => contributor.name === name));
}
