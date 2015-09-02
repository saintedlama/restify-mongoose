'use strict';
require("should");

var request = require('supertest');
var mongoose = require('mongoose');
var restifyMongoose = require('../index');
var server = require('./server');
var Note = require('./note');
var Author = require('./author');
var mongoTest = require('./util/mongotest');

describe('restify-mongoose', function () {
  describe('constructor', function () {
    it('should throw if no model is given', function () {
      (function () {
        restifyMongoose();
      }).should.throw(/Model argument/);
    });
  });

  describe('query', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    before(mongoTest.populate(Author,
      // using a known _id to simplify testing populate
      {name: 'Test Testerson', '_id': '55e077e05e207b5447171f6e'}
    ));
    before(mongoTest.populate(Note,
      {title: 'first', date: new Date(), author: '55e077e05e207b5447171f6e'},
      {title: 'second', date: new Date()},
      {title: 'third', date: new Date()}
    ));

    after(mongoTest.disconnect());

    it('should return all notes', function (done) {
      request(server())
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(3);
        })
        .end(done);
    });

    it('should filter notes according to query', function (done) {
      request(server())
        .get('/notes?q={"title":"first"}')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          res.body.should.have.length(1);
          res.body[0].title.should.equal('first');
        })
        .end(done);
    });

    it('should populate resources with referenced models according to populate query param', function (done) {
      request(server())
        .get('/notes?populate=author')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          res.body.should.have.length(3);
          res.body[0].author.name.should.equal('Test Testerson');
        })
        .end(done);
    });

    it('should fail on invalid query', function (done) {
      request(server())
        .get('/notes?q={title"first"}')
        .expect('Content-Type', /json/)
        .expect(400)
        .end(done);
    });

    it('should filter notes according to options', function (done) {
      var svr = server({
        filter: function () {
          return {"title": "second"};
        }
      });

      request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          res.body.should.have.length(1);
          res.body[0].title.should.equal('second');
        })
        .end(done);
    });

    it('should sort notes', function (done) {
      request(server())
        .get('/notes?sort=-title')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          res.body[0].title.should.equal('third');
          res.body[1].title.should.equal('second');
          res.body[2].title.should.equal('first');
        })
        .end(done);
    });

    it('should select fields of notes', function (done) {
      request(server())
        .get('/notes?select=date')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          res.body[0].should.not.have.property('title');
          res.body[1].should.not.have.property('title');
          res.body[2].should.not.have.property('title');
        })
        .end(done);
    });

    it('should emit event after querying notes', function (done) {
      var svr = server();

      var eventEmitted;
      var eventArg;
      svr.notes.on('query', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function (res) {
          eventEmitted.should.be.ok;
          eventArg.should.be.ok;
        })
        .end(done);
    });
  });

  describe('pagination', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    before(mongoTest.populate(Note,
      {title: 'first', content: 'a', date: new Date()},
      {title: 'second', content: 'a', date: new Date()},
      {title: 'third', content: 'a', date: new Date()},
      {title: 'forth', content: 'b', date: new Date()},
      {title: 'fifth', content: 'b', date: new Date()}
    ));

    after(mongoTest.disconnect());

    it('should limit notes returned to pageSize', function (done) {
      request(server({pageSize: 2}))
        .get('/notes')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(2);
        })
        .end(done);
    });

    it('should split pages by pageSize', function (done) {
      request(server({pageSize: 2}))
        .get('/notes?p=2')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(1);
        })
        .end(done);
    });

    it('should use req.query.pageSize if positive number', function (done) {
      request(server())
        .get('/notes?pageSize=3')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(3);
        })
        .end(done);
    });

    it('should override with req.query.pageSize if options.pageSize set', function (done) {
      request(server({pageSize: 1}))
        .get('/notes?pageSize=3')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(3);
        })
        .end(done);
    });

    it('should go back to options.pageSize if req.query.pageSize removed', function (done) {
      var agent = request(server({pageSize: 1}));
      agent.get('/notes?pageSize=3').end(function(){
        agent.get('/notes')
          .expect(200)
          .expect(function (res) {
            res.body.should.have.lengthOf(1);
          })
          .end(done);
      });
    });

    it('should not use req.query.pageSize if greater then 100', function (done) {
      request(server({pageSize: 1}))
        .get('/notes?pageSize=101')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(1);
        })
        .end(done);
    });

    it('should not use req.query.pageSize if lower then 0', function (done) {
      request(server({pageSize: 2}))
        .get('/notes?pageSize=-1')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(2);
        })
        .end(done);
    });

    it('should not use req.query.pageSize if not a number', function (done) {
      request(server({pageSize: 2}))
        .get('/notes?pageSize=abcd')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(2);
        })
        .end(done);
    });

    it('should not use req.query.pageSize if it is 0', function (done) {
      request(server({pageSize: 2}))
        .get('/notes?pageSize=0')
        .expect(200)
        .expect(function (res) {
          res.body.should.have.lengthOf(2);
        })
        .end(done);
    });

    function assertFirstPage(suffix) {
      return function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes' + suffix)
          .expect(200)
          .expect(function (res) {
            res.body[0].title.should.equal('first');
            res.body[1].title.should.equal('second');
          })
          .end(done);
      }
    }

    function assertTotalCount(expectedResult, options, queryString) {
      return function (done) {
        request(server(options))
          .get('/notes' + queryString)
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("x-total-count");
            res.headers['x-total-count'].should.be.exactly(expectedResult);
          })
          .end(done);
      }
    }

    it('should respond with first page given no page parameter', assertFirstPage(''));
    it('should respond with first page given blank page parameter', assertFirstPage('?p='));
    it('should respond with first page given invalid page parameter', assertFirstPage('?p=abcd'));
    it('should respond with first page given negative page number', assertFirstPage('?p=-123'));

    describe('total count header', function () {
      it('should return total count of models if no pagination used', assertTotalCount('5', '', ''));
      it('should return total count of models if pageSize set but no page selected', assertTotalCount('5', {pageSize: 2}, ''));
      it('should return total count of models if pageSize set and page selected', assertTotalCount('5', {pageSize: 2}, '?p=1'));
      it('should return total count of models if query is used', assertTotalCount('3', '', '?q={"content":"a"}'));
      it('should return total count of models if filtering is used', function (done) {
        var svr = server({
          filter: function () {
            return {"title": "second"};
          }
        });

        request(svr)
          .get('/notes')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("x-total-count");
            res.headers['x-total-count'].should.be.exactly('1');
          })
          .end(done);
      });
      it('should not return total count of models when querying details', function (done) {
        Note.create({
          title: 'detailtitle',
          date: new Date(),
          tags: ['a', 'b', 'c'],
          content: 'Content'
        }, function (err, note) {
          if (err) {
            throw err;
          }

          request(server())
            .get('/notes/' + note.id)
            .expect(200)
            .expect(function (res) {
              res.headers.should.not.have.property("x-total-count");
            })
            .end(done);
        });
      });
    });

    describe('link header', function () {
      it('should include link header with url to next page if more pages', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=1')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=2>; rel="next"'));
          })
          .end(done);
      });

      it('should preserve query parameters across urls in link header', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?q={"content":"a"}')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?q=' + encodeURIComponent('{"content":"a"}') + '&p=1>; rel="next"'));
          })
          .end(done);
      });

      it('should not include next page url in link header if no more pages', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=2')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.not.match(/rel="next"/);
          })
          .end(done);
      });

      it('should include previous page url in link header if not at first page', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=2')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=1>; rel="prev"'));
          })
          .end(done);
      });

      it('should not include previous page url in link header if already at first page', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=0')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.not.match(/rel="prev"/);
          })
          .end(done);
      });

      it('should include first page url in link header', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=0')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=0>; rel="first"'));
          })
          .end(done);
      });

      it('should support multiple links in link header', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=1')
          .expect(200)
          .expect(function (res) {
            res.headers.link.should.match(/rel="first", <http/);
            res.headers.link.should.match(/rel="prev", <http/);
          })
          .end(done);
      });

      it('should include base url paths in link header urls', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com/v1'}))
          .get('/notes?p=0')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/v1/notes\\?p=0>; rel="first"'));
          })
          .end(done);
      });

      it('should include last page url in link header if at first page', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=0')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=2>; rel="last"'));
          })
          .end(done);
      });

      it('should include last page url in link header if not at first page', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=1')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=2>; rel="last"'));
          })
          .end(done);
      });

      it('should include last page url in link header if at last page', function (done) {
        request(server({pageSize: 2, baseUrl: 'http://example.com'}))
          .get('/notes?p=2')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=2>; rel="last"'));
          })
          .end(done);
      });

      it('should include last page url in link header if page size set to 0', function (done) {
        request(server({pageSize: 0, baseUrl: 'http://example.com'}))
          .get('/notes?p=2')
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("link");
            res.headers.link.should.match(new RegExp('<http://example.com/notes\\?p=0>; rel="last"'));
          })
          .end(done);
      });
    });
  });

  describe('detail', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should select detail note', function (done) {
      Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        request(server())
          .get('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.body.title.should.equal('detailtitle');
          })
          .end(done);
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server())
        .get('/notes/' + id.toString())
        .expect('Content-Type', /json/)
        .expect(404)
        .end(done);
    });

    it('should filter notes according to options', function (done) {
      Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server({
          filter: function () {
            return {"title": "doesNotExists"};
          }
        });

        request(svr)
          .get('/notes/' + note.id)
          .expect(404)
          .end(done);
      });
    });

    it('should populate resources with referenced models according to populate query param', function (done) {
      Author.create({
        name: 'Test Testerson'
      }, function(err, author) {
        if (err) {
          throw err;
        }

        Note.create({
          title: 'detailtitle',
          date: new Date(),
          author: author.id
        }, function (err, note) {
          if (err) {
            throw err;
          }

          request(server())
            .get('/notes/' + note.id + '?populate=author')
            .expect(200)
            .expect(function (res) {
              res.body.author.name.should.equal('Test Testerson');
            })
            .end(done);
        });
      });
    });

    it('should emit event after selecting a note detail', function (done) {
      Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server();

        var eventEmitted;
        var eventArg;
        svr.notes.on('detail', function (model) {
          eventEmitted = true;
          eventArg = model;
        });

        request(svr)
          .get('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            eventEmitted.should.be.ok;
            eventArg.should.be.ok;
          })
          .end(done);
      });
    });
  });

  describe('insert', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should create note', function (done) {
      request(server())
        .post('/notes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
        })
        .end(done);
    });

    it('should create note with beforeSave', function (done) {
      var svr = server(false);
      var content = 'Specifically buy a soprano ukulele, the most common kind.';
      var opts = {
        beforeSave: function (req, model, cb) {
          model.content = content;
          cb();
        }
      };
      svr.post('/notes', svr.notes.insert(opts));

      request(svr)
        .post('/notes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
          res.body.content.should.equal(content);
        })
        .end(done);

    });

    it('should respond with 400 if not valid', function (done) {
      request(server())
        .post('/notes')
        .send({title: 'Buy a ukulele'})
        .expect('Content-Type', /json/)
        .expect(function (res) {
          res.headers.should.not.have.property("location");
        })
        .expect(400)
        .expect(/Validation failed/)
        .end(done);
    });

    it('should emit event after inserting a note', function (done) {
      var svr = server();

      var eventEmitted;
      var eventArg;
      svr.notes.on('insert', function (model) {
        eventEmitted = true;
        eventArg = model;
      });

      request(svr)
        .post('/notes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function () {
          eventEmitted.should.be.ok;
          eventArg.should.be.ok;
        })
        .end(done);
    });

    it('should return location URL including baseUrl if baseUrl defined in options', function (done) {
      request(server({baseUrl: 'http://example.com'}))
        .post('/notes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
          res.headers.location.should.be.equal('http://example.com/notes/' + res.body._id);
        })
        .end(done);
    });

    it('should return location URL without baseUrl if baseUrl missing in options', function (done) {
      request(server())
        .post('/notes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
          res.headers.location.should.be.equal('/notes/' + res.body._id);
        })
        .end(done);
    });
  });

  describe('update', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should update existing note', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        request(server())
          .patch('/notes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("location");
          })
          .end(done);
      });
    });

    it('should update existing note with beforeSave', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server(false);
        var content = 'Specifically buy a soprano ukulele, the most common kind.';
        var opts = {
          beforeSave: function (req, model, cb) {
            model.content = content;
            cb();
          }
        };
        svr.patch('/notes/:id', svr.notes.update(opts));


        request(svr)
          .patch('/notes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(function (res) {
            res.headers.should.have.property("location");
            res.body.content.should.equal(content);
          })
          .expect(200)
          .end(done);
      });
    });

    it('should fail on invalid content', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        request(server())
          .patch('/notes/' + note.id)
          .send()
          .expect(400)
          .expect(function (res) {
            res.headers.should.not.have.property("location");
          })
          .end(done);
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server())
        .patch('/notes/' + id.toString())
        .send({title: 'Buy a guitar'})
        .expect('Content-Type', /json/)
        .expect(404)
        .expect(function (res) {
          res.headers.should.not.have.property("location");
        })
        .end(done);
    });

    it('should filter notes according to options', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server({
          filter: function () {
            return {"title": "doesNotExists"};
          }
        });

        request(svr)
          .patch('/notes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect(function (res) {
            res.headers.should.not.have.property("location");
          })
          .expect(404)
          .end(done);
      });
    });

    it('should emit event after updating a note', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server();

        var eventEmitted;
        var eventArg;
        svr.notes.on('update', function (model) {
          eventEmitted = true;
          eventArg = model;
        });

        request(svr)
          .patch('/notes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(function (res) {
            res.headers.should.have.property("location");
            res.headers.location.should.be.equal('/notes/' + note.id);
          })
          .expect(200)
          .expect(function () {
            eventEmitted.should.be.ok;
            eventArg.should.be.ok;
          })
          .end(done);
      });
    });

    it('should return location URL including baseUrl if baseUrl defined in options', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        request(server({baseUrl: 'http://example.com'}))
          .patch('/notes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("location");
            res.headers.location.should.be.equal('http://example.com/notes/' + res.body._id);
          })
          .end(done);
      });
    });

    it('should return location URL without baseUrl if baseUrl missing in options', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        request(server())
          .patch('/notes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.headers.should.have.property("location");
            res.headers.location.should.be.equal('/notes/' + res.body._id);
          })
          .end(done);
      });
    });
  });

  describe('delete', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should delete existing note', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        request(server())
          .del('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(done);
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server())
        .del('/notes/' + id.toString())
        .send({title: 'Buy a guitar'})
        .expect('Content-Type', /json/)
        .expect(404)
        .end(done);
    });

    it('should filter notes according to options', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server({
          filter: function () {
            return {"title": "doesNotExists"};
          }
        });

        request(svr)
          .del('/notes/' + note.id)
          .expect(404)
          .end(done);
      });
    });

    it('should emit event after deleting a note', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var svr = server();

        var eventEmitted;
        var eventArg;
        svr.notes.on('remove', function (model) {
          eventEmitted = true;
          eventArg = model;
        });

        request(svr)
          .del('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function () {
            eventEmitted.should.be.ok;
            eventArg.should.be.ok;
          })
          .end(done);
      });
    });
  });

  describe('serve', function () {
    var generateOptions = function (beforeCalled, afterCalled) {
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

    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should return query notes', function (done) {
      Note.create({
        title: 'some new note',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled);

        var svr = server(false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .get('/servenotes')
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.body.should.have.lengthOf(1);
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should select detail note', function (done) {
      Note.create({
        title: 'detailtitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled);

        var svr = server(false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .get('/servenotes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.body.title.should.equal('detailtitle');
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should create note', function (done) {
      var beforeCalled = [false, false];
      var afterCalled = [false, false];
      var options = generateOptions(beforeCalled, afterCalled);

      var svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
          beforeCalled.should.matchEach(true);
          afterCalled.should.matchEach(true);
        })
        .end(done);
    });

    it('should create note with beforeSave', function (done) {
      var beforeCalled = [false, false];
      var afterCalled = [false, false];
      var options = generateOptions(beforeCalled, afterCalled);

      var svrOptions = {};
      var content = 'Specifically buy a soprano ukulele, the most common kind.';
      svrOptions.beforeSave = function (req, model, cb) {
        model.content = content;
        cb();
      };

      var svr = server(svrOptions, false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
          res.body.content.should.equal(content);
          beforeCalled.should.matchEach(true);
          afterCalled.should.matchEach(true);
        })

        .end(done);
    });

    it('should update existing note', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled);

        var svr = server(false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .patch('/servenotes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should update existing note with beforeSave', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled);

        var svrOptions = {};
        var content = 'Specifically buy a soprano ukulele, the most common kind.';
        svrOptions.beforeSave = function (req, model, cb) {
          model.content = content;
          cb();
        };

        var svr = server(svrOptions, false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .patch('/servenotes/' + note.id)
          .send({title: 'Buy a ukulele'})
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            res.body.content.should.equal(content);
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should delete existing note', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled);

        var svr = server(false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .del('/servenotes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function (res) {
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should not require "before" or "after" middleware', function (done) {
      var svr = server(false);
      svr.notes.serve('/servenotes', svr, {});

      request(svr)
        .post('/servenotes')
        .send({title: 'Buy a ukulele without middleware', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
        })
        .end(done);
    });

    it('should allow to pass a single "before" middleware as non array', function (done) {
      var beforeCalled = false;

      var options = {
        before: function (req, res, next) {
          beforeCalled = true;
          next();
        }
      };

      var svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function () {
          beforeCalled.should.equal(true);
        })
        .end(done);
    });

    it('should allow to pass a single "after" middleware as non array', function (done) {
      var afterCalled = false;

      var options = {
        after: function (req, res, next) {
          afterCalled = true;
          next();
        }
      };

      var svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function () {
          afterCalled.should.equal(true);
        })
        .end(done);
    });
  });

  describe('output formats', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should return json-api format if defined in options', function (done) {
      request(server({outputFormat: 'json-api'}))
        .post('/notes')
        .send({title: 'Buy a ukulele', date: new Date()})
        .expect('Content-Type', /json/)
        .expect(201)
        .expect(function (res) {
          res.headers.should.have.property("location");
          res.body.should.have.property("notes");
          res.body.notes.title.should.be.equal("Buy a ukulele");
        })
        .end(done);
    });
  });

  describe('errors', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should serve mongoose validation errors as errors property in body for create', function (done) {
      request(server())
        .post('/notes')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400)
        .expect(function (res) {
          res.body.message.should.exist;
          res.body.errors.should.exist;
          res.body.errors.date.should.exist;
          res.body.errors.title.should.exist;
        })
        .end(done);
    });

    it('should serve mongoose validation errors as errors property in body for update', function (done) {
      Note.create({
        title: 'updateThisTitle',
        date: new Date(),
        tags: ['a', 'b', 'c'],
        content: 'Content'
      }, function (err, note) {
        if (err) {
          throw err;
        }
        var svr = server(false);
        svr.notes.serve('/servenotes', svr);

        request(svr)
          .patch('/servenotes/' + note.id)
          .send({title: '', date: new Date()})
          .expect('Content-Type', /json/)
          .expect(400)
          .expect(function (res) {
            res.body.message.should.exist;
            res.body.errors.should.exist;
            res.body.errors.title.should.exist;
          })
          .end(done);
      });
    });
  });
});
