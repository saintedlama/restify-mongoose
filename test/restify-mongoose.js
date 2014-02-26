'use strict';
require("should");

var request = require('supertest');
var mongoose = require('mongoose');

var server = require('./server');
var Note = require('./note');
var mongoTest = require('./util/mongotest');

describe('restify-mongoose', function () {
  describe('query', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    before(mongoTest.populate(Note,
      { title: 'first', date: new Date() },
      { title: 'second', date: new Date() },
      { title: 'third', date: new Date() }
    ));

    after(mongoTest.disconnect());

    it('should return all notes', function (done) {
      request(server)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if(err) {
            throw err;
          }

          res.body.should.have.lengthOf(3);
          done();
        });
    });

    it('should filter notes', function (done) {
      request(server)
        .get('/notes?q={"title":"first"}')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if(err) {
            throw err;
          }

          res.body.should.have.length(1);
          res.body[0].title.should.equal('first');
          done();
        });
    });

    it('should filter notes', function (done) {
      request(server)
        .get('/notes?q={"title":"first"}')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if(err) {
            throw err;
          }

          res.body.should.have.lengthOf(1);
          res.body[0].title.should.equal('first');
          done();
        });
    });

    it('should sort notes', function (done) {
      request(server)
        .get('/notes?sort=-title')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if(err) {
            throw err;
          }

          res.body[0].title.should.equal('third');
          res.body[1].title.should.equal('second');
          res.body[2].title.should.equal('first');

          done();
        });
    });

    it('should select fields of notes', function (done) {
      request(server)
        .get('/notes?select=date')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if(err) {
            throw err;
          }

          res.body[0].should.not.have.property('title');
          res.body[1].should.not.have.property('title');
          res.body[2].should.not.have.property('title');

          done();
        });
    });
  });

  describe('detail', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should select detail note', function (done) {
      Note.create({ title: 'detailtitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        request(server)
          .get('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function (err, res) {
            if(err) {
              throw err;
            }

            res.body.title.should.equal('detailtitle');
            done();
          });
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server)
        .get('/notes/' + id.toString())
        .expect('Content-Type', /json/)
        .expect(404, done);
    });
  });

  describe('new', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should create note', function (done) {
      request(server)
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res) {
          if(err) {
            throw err;
          }
          res.headers.should.have.property("location");
          done();
        });
    });

    it('should respond with 400 if not valid', function (done) {
      request(server)
        .post('/notes')
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(400, done);
    });
  });

  describe('update', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should update existing note', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        request(server)
          .patch('/notes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect('Content-Type', /json/)
          .expect(200, done);
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server)
        .patch('/notes/' + id.toString())
        .send({ title: 'Buy a guitar'})
        .expect('Content-Type', /json/)
        .expect(404, done);
    });
  });

  describe('delete', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should delete existing note', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        request(server)
          .del('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200, done);
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server)
        .del('/notes/' + id.toString())
        .send({ title: 'Buy a guitar'})
        .expect('Content-Type', /json/)
        .expect(404, done);
    });
  });
});
