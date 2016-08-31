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
import Protocol from './protocol';

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
   * @param {Object} rpcOpts include:
   *   name {String} thrift/grpc/...
   *   [host] {String} if createServer
   *   [port] {Number} if createServer
   *   options {Object} options of each `require(${rpcOpts.name})`
   * @param {Object} pocOpts include:
   *   name {String} thrift/grpc/...
   *   [host] {String} if createServer
   *   [port] {Number} if createServer
   *   options {Object} options of each `require(${pocOpts.name})`
   */
  constructor(rpcOpts, pocOpts) {

    // merge default
    rpcOpts = merge({ name: 'node-rpc-thrift' }, rpcOpts);
    pocOpts = merge({ name: 'node-rpc-redis' }, pocOpts);

    try {
      // require
      let rpc = require(rpcOpts.name);
      // this fields
      this.rpc = new rpc(rpcOpts);
      this.host = utils.getLocalIPv4();

    } catch (e) {
      throw new TypeError(`require error, please \`npm i ${rpcOpts.name} --save\``);
    }

    // protocol
    this.protocol = new Protocol(pocOpts);

  }

}

/**
 * rpc server
 */
class Server extends BaseTransport {

  /**
   * createServer
   */
  constructor(rpcOpts, pocOpts) {
    super(rpcOpts, pocOpts);

    // services' map
    this.services = new Map();
    this.port = typeof rpcOpts.port === 'number' ? rpcOpts.port : 7007;

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
    self.server = self.rpc.createServer(self.port);
    // events
    self.on = (event, cb) => {
      self.server.on(event, cb);
    };

    self.id = self.host + ':' + self.port;

    self.server.register(self.handler);
  }

  /**
   * calling server's function
   * 
   * @param {String} alias service alias
   * @param {String} action service.action
   * @param {Array} params service.action.apply(null, params)
   */
  async handler({ alias, action, params = {} }) {
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
  async register({ alias, service, permission }) {
    let self = this;

    // alias/service/functions
    permission = utils.trans2Array(permission, isString);
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
    self.services.set(alias, { service, permit });

    // publish
    await self.protocol.publish(alias, { host: self.host, port: self.port, permit });
  }

}

exports.Server = Server;

/**
 * rpc client
 */
class Client extends BaseTransport {

  constructor(options) {
    super(options);

    // manage clients
    this.clients = new Map();
  }

  /**
   * find clients from this.protocol
   * 
   * @param {String} alias service unique name
   */
  async findClient(alias) {
    let self = this;

    let client = self.clients.get(alias);
    if (!client) {
      // initial
      self.clients.set(alias, new utils.DLinkedList());
      self.subscribe(alias);
      // get from protocol
      let keys = await self.protocol.getListKeys({ alias: alias, id: '*' });
      // no service found
      if (isEmpty(keys)) {
        return null;
      }

      await self.createClients(alias, keys);
    }

    // return one client
    return client.next();
  }

  /**
   * find services from this.protocol and createClients
   * 
   * @param {String} alias service unique name
   * @param {Array} keys providers list of this alias 
   */
  async createClients(alias, keys) {
    let self = this;

    await self.protocol.getListValues(keys).map((data) => { // for each

      try {
        // parse and check
        data = JSON.parse(data);

        if (data && data.host && data.port) {
          data.id = data.host + ':' + data.port;

          // jump
          if (self.clients.get(alias).item(data.id)) {
            return null;
          }
          // set id
          data.client = self.rpc.createClient(data);

          // cannot connect
          data.client.on('close', () => {
            // delete from _adapter and _clients
            self.clients.get(alias).remove(data.id);
          });

          // add
          self.clients.get(alias).append(data);

        }

      } catch (e) {
        // TODO: logs
      }

    });

  }

  /**
   * subscribe new service
   * 
   * @param {String} alias service unique name
   */
  subscribe(alias) {
    let self = this;

    self.protocol.subscribe({ alias }, (error, keys) => {
      let newKeys = [];
      if (error) {
        // TODO: logs
        return;
      }

      keys.forEach((key) => {
        let origin = utils.getOriginKey(key);
        if (origin && (alias === origin.alias) && origin.id) {
          if (self.clients.get(alias) && !self.clients.get(alias).item(origin.id)) {
            newKeys.push(this.protocol.getKey({ alias: alias, id: origin.id }));
          }
        }
      });

      self.createClients(alias, newKeys);
    });
  }

  /**
   * call remote service[action](params)
   * 
   * @param {String} alias service unique name
   * @param {String} action remote service[action]
   * @param {Array} params remote function params
   * 
   * @return {Promise|bluebird|*}
   */
  async call(alias, action, params) {
    let self = this;
    try {
      if (!alias) { // check alias
        throw new Error(`Invalid alias: ${alias}`);
      }

      // get client
      let client = await self.findClient(alias);
      if (client) {
        // check permission
        if (client.permit && !client.permit[action]) {
          return Promise.reject('action forbidden');
        }

        // doCall
        return await client.client.doCall(alias, action, params);
      }

    } catch (err) {
      return Promise.reject(err);
    }

  }
}

exports.Client = Client;
