var request = require('supertest');
var expect = require('chai').expect;
var mongoose = require('mongoose');

var server = require('./server');
var Note = require('./note');
var mongoTest = require('./util/mongotest');

describe('restify-mongoose', function() {
    describe('query', function() {
        before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
        before(mongoTest.populate(Note,
            { title : 'first', date : new Date() },
            { title : 'second', date : new Date() },
            { title : 'third', date : new Date() }
        ));

        after(mongoTest.disconnect());

        it('should return all notes', function(done) {
            request(server)
                .get('/notes')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function(err, res){
                    expect(err).to.not.exist;

                    expect(res.body).to.have.length(3);
                    done();
                });
        });

        it('should filter notes', function(done) {
            request(server)
                .get('/notes?q={"title":"first"}')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function(err, res){
                    expect(err).to.not.exist;

                    expect(res.body).to.have.length(1);
                    expect(res.body[0].title).to.equal('first');
                    done();
                });
        });

        it('should filter notes', function(done) {
            request(server)
                .get('/notes?q={"title":"first"}')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function(err, res){
                    expect(err).to.not.exist;

                    expect(res.body).to.have.length(1);
                    expect(res.body[0].title).to.equal('first');
                    done();
                });
        });

        it('should sort notes', function(done) {
            request(server)
                .get('/notes?sort=-title')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function(err, res){
                    expect(err).to.not.exist;

                    expect(res.body[0].title).to.equal('third');
                    expect(res.body[1].title).to.equal('second');
                    expect(res.body[2].title).to.equal('first');

                    done();
                });
        });

        it('should select fields of notes', function(done) {
            request(server)
                .get('/notes?select=date')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function(err, res){
                    expect(err).to.not.exist;

                    expect(res.body[0]).to.not.have.property('title');
                    expect(res.body[1]).to.not.have.property('title');
                    expect(res.body[2]).to.not.have.property('title');

                    done();
                });
        });
    });

    describe('detail', function() {
        before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
        after(mongoTest.disconnect());

        it('should select detail note', function(done) {
            Note.create({ title : 'detailtitle', date: new Date(), tags : ['a', 'b', 'c'], content : 'Content' }, function(err, note) {
                expect(err).to.not.exist;

                request(server)
                    .get('/notes/' + note.id)
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function(err, res){
                        expect(err).to.not.exist;

                        expect(res.body.title).to.equal('detailtitle');
                        done();
                    });
            });
        });

        it('should respond with 404 if not found', function(done) {
            var id = new mongoose.Types.ObjectId();

            request(server)
                .get('/notes/' + id.toString())
                .expect('Content-Type', /json/)
                .expect(404, done);
        });
    });

    describe('new', function() {
        before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
        after(mongoTest.disconnect());

        it('should create note', function(done) {
                request(server)
                    .post('/notes')
                    .send({ title: 'Buy a ukulele', date : new Date() })
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function(err, res){
                        expect(err).to.not.exist;
                        expect(res.headers.location).to.exist;
                        done();
                    });
            });

        it('should respond with 400 if not valid', function(done) {
            request(server)
                .post('/notes')
                .send({ title: 'Buy a ukulele' })
                .expect('Content-Type', /json/)
                .expect(400, done);
        });
    });

    describe('update', function() {
        before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
        after(mongoTest.disconnect());

        it('should update existing note', function(done) {
            Note.create({ title : 'updateThisTitle', date: new Date(), tags : ['a', 'b', 'c'], content : 'Content' }, function(err, note) {
                expect(err).to.not.exist;

                request(server)
                    .patch('/notes/' + note.id)
                    .send({ title: 'Buy a ukulele' })
                    .expect('Content-Type', /json/)
                    .expect(200, done);
            });
        });

        it('should respond with 404 if not found', function(done) {
            var id = new mongoose.Types.ObjectId();

            request(server)
                .patch('/notes/' + id.toString())
                .send({ title : 'Buy a guitar'})
                .expect('Content-Type', /json/)
                .expect(404, done);
        });
    });

    describe('delete', function() {
        before(mongoTest.prepareDb('mongodb://localhost/restify-mongoose-tests'));
        after(mongoTest.disconnect());

        it('should delete existing note', function(done) {
            Note.create({ title : 'updateThisTitle', date: new Date(), tags : ['a', 'b', 'c'], content : 'Content' }, function(err, note) {
                expect(err).to.not.exist;

                request(server)
                    .del('/notes/' + note.id)
                    .expect('Content-Type', /json/)
                    .expect(200, done);
            });
        });

        it('should respond with 404 if not found', function(done) {
            var id = new mongoose.Types.ObjectId();

            request(server)
                .del('/notes/' + id.toString())
                .send({ title : 'Buy a guitar'})
                .expect('Content-Type', /json/)
                .expect(404, done);
        });
    });
});