// Type definitions for restify-mongoose 1.0.0
// Project: https://github.com/saintedlama/restify-mongoose
// Definitions by: Markus Kolb <https://github.com/kolbma>

/// <reference types="mongoose" />
/// <reference types="restify" />

import * as restify from 'restify';
import * as mongoose from 'mongoose';

declare namespace RestifyMongoose {

  type filterFunction = ((req: restify.Request, res: restify.Response) => object);
  type projectionFunction = ((req: restify.Request, item: mongoose.Model<mongoose.Document>, cb: ((err: Error, doc: mongoose.Document) => void)) => void);
  type beforeSaveFunction = ((req: restify.Request, item: mongoose.Model<mongoose.Document>, cb: (() => void)) => void);

  interface BaseOptions {
    baseUrl?: string;
    outputFormat?: string; // default 'regular';
    modelName?: string; // default Model.modelName;
  }

  interface ResourceOptions extends BaseOptions {
    queryString?: string;
    pageSize?: number;
    maxPageSize?: number;
    listProjection?: projectionFunction;
    detailProjection?: projectionFunction;
    filter?: filterFunction;
  }

  interface QueryOptions extends BaseOptions {
    pageSize?: number;
    maxPageSize?: number;
    projection?: projectionFunction;
    populate?: string;
    select?: string;
    sort?: string;
  }

  interface DetailOptions extends BaseOptions {
    projection?: projectionFunction;
    populate?: string;
    select?: string;
  }

  interface InsertOptions extends BaseOptions {
    beforeSave?: beforeSaveFunction;
  }

  interface UpdateOptions extends BaseOptions {
    beforeSave?: beforeSaveFunction;
  }

  interface ServeOptions {
    before?: restify.RequestHandler[],
    after?: restify.RequestHandler[]
  }

  class Resource {
    constructor(model: mongoose.Model<mongoose.Document>, options?: ResourceOptions);
    query: ((options?: QueryOptions) => ((req: restify.Request, res: restify.Response, next: restify.Next) => void));
    detail: ((options?: DetailOptions) => ((req: restify.Request, res: restify.Response, next: restify.Next) => void));
    insert: ((options?: InsertOptions) => ((req: restify.Request, res: restify.Response, next: restify.Next) => void));
    update: ((options?: UpdateOptions) => ((req: restify.Request, res: restify.Response, next: restify.Next) => void));
    remove: (() => ((req: restify.Request, res: restify.Response, next: restify.Next) => void));
    serve: ((path: string, server: restify.Server, options?: ServeOptions) => void);
  }

}

declare function RestifyMongoose(model: mongoose.Model<mongoose.Document>, options?: RestifyMongoose.ResourceOptions): RestifyMongoose.Resource;

export = RestifyMongoose;
