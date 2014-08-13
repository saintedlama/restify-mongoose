'use strict';
require("should");

var request = require('supertest');
var mongoose = require('mongoose');
var restifyMongoose = require('../index');
var server = require('./server');
var Note = require('./note');
var mongoTest = require('./util/mongotest');

describe('restify-mongoose', function () {
  describe('constructor', function () {
    it('should throw if no model is given', function(){
      (function() {
        restifyMongoose();
      }).should.throw(/Model argument/);
    });
  });

  describe('query', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    before(mongoTest.populate(Note,
      { title: 'first', date: new Date() },
      { title: 'second', date: new Date() },
      { title: 'third', date: new Date() }
    ));

    after(mongoTest.disconnect());

    it('should return all notes', function (done) {
      request(server())
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          res.body.should.have.lengthOf(3);
        })
        .end(done);
    });

    it('should filter notes according to query', function (done) {
      request(server())
        .get('/notes?q={"title":"first"}')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          res.body.should.have.length(1);
          res.body[0].title.should.equal('first');
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
        filter : function() {
          return {"title":"second"};
        }
      });

      request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
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
        .expect(function(res) {
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
        .expect(function(res) {
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
      svr.notes.on('query', function(model) {
        eventEmitted = true;
        eventArg = model;
      });

      request(svr)
        .get('/notes')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          eventEmitted.should.be.ok;
          eventArg.should.be.ok;
        })
        .end(done);
    });
  });

  describe('query-pagination', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    before(mongoTest.populate(Note,
      { title: 'first', date: new Date() },
      { title: 'second', date: new Date() },
      { title: 'third', date: new Date() },
      { title: 'forth', date: new Date() },
      { title: 'fifth', date: new Date() }
    ));

    after(mongoTest.disconnect());

    it('should limit notes returned to pageSize', function (done) {
      request(server({ pageSize: 2 }))
        .get('/notes')
        .expect(200)
        .expect(function(res) {
          res.body.should.have.lengthOf(2);
        })
        .end(done);
    });

    it('should split pages by pageSize', function (done) {
      request(server({ pageSize: 2 }))
        .get('/notes?p=2')
        .expect(200)
        .expect(function(res) {
          res.body.should.have.lengthOf(1);
        })
        .end(done);
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

        request(server())
          .get('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function(res) {
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
      Note.create({ title: 'detailtitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server({ filter : function() {
          return {"title":"doesNotExists"};
        }});

        request(svr)
          .get('/notes/' + note.id)
          .expect(404)
          .end(done);
      });
    });

    it('should emit event after selecting a note detail', function (done) {
      Note.create({ title: 'detailtitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server();

        var eventEmitted;
        var eventArg;
        svr.notes.on('detail', function(model) {
          eventEmitted = true;
          eventArg = model;
        });

        request(svr)
          .get('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function(res) {
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
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          res.headers.should.have.property("location");
        })
        .end(done);
    });

    it('should create note with beforeSave', function (done) {
      var svr = server(false);
      var content = 'Specifically buy a soprano ukulele, the most common kind.';
      var opts = {
        beforeSave: function(req, model, cb) {
          model.content = content; 
          cb();
        }
      };
      svr.post('/notes', svr.notes.insert(opts));

      request(svr)
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          res.headers.should.have.property("location");
          res.body.content.should.equal(content);
        })
        .end(done);

    });

    it('should respond with 400 if not valid', function (done) {
      request(server())
        .post('/notes')
        .send({ title: 'Buy a ukulele' })
        .expect('Content-Type', /json/)
        .expect(400)
        .expect(/Validation failed/)
        .end(done);
    });

    it('should emit event after inserting a note', function (done) {
      var svr = server();

      var eventEmitted;
      var eventArg;
      svr.notes.on('insert', function(model) {
        eventEmitted = true;
        eventArg = model;
      });

      request(svr)
        .post('/notes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function() {
          eventEmitted.should.be.ok;
          eventArg.should.be.ok;
        })
        .end(done);
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

        request(server())
          .patch('/notes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect('Content-Type', /json/)
          .expect(200)
          .end(done);
      });
    });

    it('should update existing note with beforeSave', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server(false);
        var content = 'Specifically buy a soprano ukulele, the most common kind.';
        var opts = {
          beforeSave: function(req, model, cb) {
            model.content = content;
            cb();
          }
        };
        svr.patch('/notes/:id', svr.notes.update(opts));
        

        request(svr)
          .patch('/notes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect('Content-Type', /json/)
          .expect(function(res) {
            res.body.content.should.equal(content);
          })
          .expect(200)
          .end(done);
      });
    });

    it('should fail on invalid content', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        request(server())
          .patch('/notes/' + note.id)
          .send()
          .expect(400)
          .end(done);
      });
    });

    it('should respond with 404 if not found', function (done) {
      var id = new mongoose.Types.ObjectId();

      request(server())
        .patch('/notes/' + id.toString())
        .send({ title: 'Buy a guitar'})
        .expect('Content-Type', /json/)
        .expect(404)
        .end(done);
    });

    it('should filter notes according to options', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server({ filter : function() {
          return {"title":"doesNotExists"};
        }});

        request(svr)
          .patch('/notes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect(404)
          .end(done);
      });
    });

    it('should emit event after updating a note', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server();

        var eventEmitted;
        var eventArg;
        svr.notes.on('update', function(model) {
          eventEmitted = true;
          eventArg = model;
        });

        request(svr)
          .patch('/notes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function() {
            eventEmitted.should.be.ok;
            eventArg.should.be.ok;
          })
          .end(done);
      });
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
        .send({ title: 'Buy a guitar'})
        .expect('Content-Type', /json/)
        .expect(404)
        .end(done);
    });

    it('should filter notes according to options', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server({
          filter : function() {
            return {"title":"doesNotExists"};
          }
        });

        request(svr)
          .del('/notes/' + note.id)
          .expect(404)
          .end(done);
      });
    });

    it('should emit event after deleting a note', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var svr = server();

        var eventEmitted;
        var eventArg;
        svr.notes.on('remove', function(model) {
          eventEmitted = true;
          eventArg = model;
        });

        request(svr)
          .del('/notes/' + note.id)
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function() {
            eventEmitted.should.be.ok;
            eventArg.should.be.ok;
          })
          .end(done);
      });
    });
  });

  describe('serve', function () {
    var generateOptions = function(beforeCalled, afterCalled) {
      return {
        before: [ function(req, res, next) {
          beforeCalled[0] = true;
          next();
        }, function(req, res, next) {
          beforeCalled[1] = true;
          next();
        }],
        after: [ function(req, res, next) {
          afterCalled[0] = true; 
          next();
        }, function(req, res, next) {
          afterCalled[1] = true;
          next();
        }]
      };
    };

    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should return query notes', function (done) {
      Note.create({ title: 'some new note', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
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
          .expect(function(res) {
            res.body.should.have.lengthOf(1);
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should select detail note', function (done) {
      Note.create({ title: 'detailtitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
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
          .expect(function(res) {
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
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
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
      svrOptions.beforeSave = function(req, model, cb) {
        model.content = content;
        cb();
      };

      var svr = server(svrOptions, false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          res.headers.should.have.property("location");
          res.body.content.should.equal(content);
          beforeCalled.should.matchEach(true);
          afterCalled.should.matchEach(true);
        })

        .end(done);
    });

    it('should update existing note', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled); 

        var svr = server(false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .patch('/servenotes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function(res) {
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should update existing note with beforeSave', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }

        var beforeCalled = [false, false];
        var afterCalled = [false, false];
        var options = generateOptions(beforeCalled, afterCalled); 

        var svrOptions = {};
        var content = 'Specifically buy a soprano ukulele, the most common kind.';
        svrOptions.beforeSave = function(req, model, cb) {
          model.content = content;
          cb();
        };

        var svr = server(svrOptions, false);
        svr.notes.serve('/servenotes', svr, options);

        request(svr)
          .patch('/servenotes/' + note.id)
          .send({ title: 'Buy a ukulele' })
          .expect('Content-Type', /json/)
          .expect(200)
          .expect(function(res) {
            res.body.content.should.equal(content);
            beforeCalled.should.matchEach(true);
            afterCalled.should.matchEach(true);
          })
          .end(done);
      });
    });

    it('should delete existing note', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
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
          .expect(function(res) {
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
        .send({ title: 'Buy a ukulele without middleware', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function(res) {
          res.headers.should.have.property("location");
        })
        .end(done);
    });

    it('should allow to pass a single "before" middleware as non array', function (done) {
      var beforeCalled = false;

      var options = {
        before : function(req, res, next) {
          beforeCalled = true;
          next();
        }
      };

      var svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function() {
          beforeCalled.should.equal(true);
        })
        .end(done);
    });

    it('should allow to pass a single "after" middleware as non array', function (done) {
      var afterCalled = false;

      var options = {
        after : function(req, res, next) {
          afterCalled = true;
          next();
        }
      };

      var svr = server(false);
      svr.notes.serve('/servenotes', svr, options);

      request(svr)
        .post('/servenotes')
        .send({ title: 'Buy a ukulele', date: new Date() })
        .expect('Content-Type', /json/)
        .expect(200)
        .expect(function() {
          afterCalled.should.equal(true);
        })
        .end(done);
    });
  });

  describe('errors', function () {
    before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
    after(mongoTest.disconnect());

    it('should serve mongoose validation errors as errors property in body for create', function(done) {
      request(server())
        .post('/notes')
        .send({ })
        .expect('Content-Type', /json/)
        .expect(400)
        .expect(function(res) {
          res.body.message.should.exist;
          res.body.errors.should.exist;
          res.body.errors.date.should.exist;
          res.body.errors.title.should.exist;
        })
        .end(done);
    });

    it('should serve mongoose validation errors as errors property in body for update', function (done) {
      Note.create({ title: 'updateThisTitle', date: new Date(), tags: ['a', 'b', 'c'], content: 'Content' }, function (err, note) {
        if(err) {
          throw err;
        }
        var svr = server(false);
        svr.notes.serve('/servenotes', svr);

        request(svr)
          .patch('/servenotes/' + note.id)
          .send({ title: '', date: new Date() })
          .expect('Content-Type', /json/)
          .expect(400)
          .expect(function(res) {
            res.body.message.should.exist;
            res.body.errors.should.exist;
            res.body.errors.title.should.exist;
          })
          .end(done);
      });
    });
  });
});
