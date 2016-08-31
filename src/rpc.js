// Copyright (c) 2016 zzun <xtkml.g@gmail.com>
// 
// This software is released under the MIT License.
// http://opensource.org/licenses/mit-license.php

import merge from 'lodash/merge';
import isString from 'lodash/isString';
import isEmpty from 'lodash/isEmpty';
import isFunction from 'lodash/isFunction';
import Promise from 'bluebird';
import utils from './util';

/**
 * Wrap thrift/grpc ... and provide
 *  1. create rpc server
 *  2. register service
 *  3. remote calling
 */
class BaseTransport {

  /**
   * initial
   *
   * @param {Object} options include:
   *   name {String} thrift/grpc/...
   *   [host] {String} if createServer
   *   [port] {Number} if createServer
   *   options {Object} options of each `require(${name})`
   */
  constructor(options) {

    // merge default
    options = merge({
      name: 'thrift',
    }, options);

    try {
      // require
      let rpc = require(options.name);
      // this fields
      this.rpc = new rpc(options);

    } catch (e) {
      throw new TypeError(`require error, please \`npm i ${options.name} --save\``);
    }

  }

}

/**
 * rpc server
 */
class Server extends BaseTransport {

  /**
   * createServer
   */
  constructor(options) {
    super(options);

    // services' map
    this.services = new Map();

    this.port = typeof options.port === 'number' ? options.port : 7007;
    this.host = utils.getLocalIPv4();

    this.createServer(); // listening
  }

  /**
   * this.rpc.createServer(port)
   */
  async createServer() {
    let self = this;

    // get a port
    self.port = await utils.getUnusedPort(self.port);

    // init server
    self.server = self.rpc.createServer(self.host, self.port);
    // events
    self.on = (event, cb) => {
      self.server.on(event, cb);
    };

    self.register(self.handler);
  }

  /**
   * calling server's function
   * 
   * @param {String} alias service alias
   * @param {String} action service.action
   * @param {Array} params service.action.apply(null, params)
   */
  async handler(alias, action, params) {
    let self = this;

    try {
      // get service's function
      let { service, permit } = self.services.get(alias);

      if (permit && permit[action]) { // check permit
        throw new Error('premission check failure');
      }

      // calling
      return await Promise.resolve(service[action].apply(null, params));

    } catch (err) {
      // throw ?
      return Promise.reject(err);
    }
  }

  /**
   * register services for calling
   * @param {Object} s - service:
   *   {
   *     1. {String} [alias] // unique, if null, use the service.name or service.identity
   *     2. {Object|String} service // service object
   *     3. {Array|String} [permission] // if null, allow all service functions
   *     *4. {String} [version]
   *   }
   * @return {*}
   */
  register(s) {
    let self = this;

    // alias/service/functions
    let alias = s.alias,
      service = s.service,
      permission = utils.trans2Array(s.permission, isString);
    // check alias
    alias = utils.exec((alias) ? alias : (service.name || service.identity));

    // functions permission
    let permit = false;
    if (!isEmpty(permission)) {
      permit = {};
      // check each permit
      permission.forEach((name) => {
        if (service && isFunction(service[name])) {
          permit[name] = true;
        } else {
          self.rpc.emit(utils.EVENT.ERROR, { err: 'Invalid service or action', message: 'service: ' + alias + ', function: ' + name });
        }
      });
    }
    // put to map
    this.services.set(alias, { service, permit });
  }

}

exports.Server = Server;

/**
 * rpc client
 */
class Client extends BaseTransport {

  constructor(options) {
    super(options);
  }
}

exports.Client = Client;
