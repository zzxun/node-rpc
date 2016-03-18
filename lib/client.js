/**
 * client
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

const _ = require('lodash');
const thrift = require('thrift');
const Promises = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const transport = require('./transport'),
      utils     = require('./util'),
      Adapter   = require('./adapter');

const Processor = transport.Processor;

const EVENT = utils.EVENT;

/**
 * manage all thrift client of `Processor`
 * @param {Object} options config include:
 *   {
 *     1. adapter: { // {Object} config
 *         [name='zookeeper'] // redis or zookeeper
 *         [options={}] // options of adapter
 *     }
 *     2. [thrifts]: { // {Array|Object}, for create
 *         alias // find the server
 *         processor // gen-nodejs thrift processor
 *     }
 *   }
 */
class ThriftClient extends EventEmitter {

  constructor(options) {
    super();

    let self = this;

    // random server id
    self._host = utils.getLocalIPv4();
    self._id = utils.ID(self._host);
    // null
    options = options || {};
    // init redis
    self._adapter = new Adapter(options.adapter);
    // redis on error
    self._adapter.on(EVENT.LOG.ERROR, (err) => {
      self.emit(EVENT.LOG.ERROR, err);
    });
    self._adapter.on(EVENT.READY, (info) => {

      self.emit(EVENT.LOG.INFO, info);

      // all clients
      self._clients = {};
      // thrift
      self._thrifts = {};
      utils.trans2Array(options.thrifts, _.isObject).forEach((thrift) => {
        if (thrift.alias && thrift.processor) {
          self._thrifts[thrift.alias] = thrift.processor;
        }
      });

      self.emit(EVENT.READY, 'ThriftClient ready, id: ' + self._id);
    });

  }

  /**
   * 1. call(alias, [callback]) // for use defined gen-nodejs thrift processor
   *   return a thrift client {thrift.createClient}.
   *   callback(error, client) // if without callback, return a Promise {bluebird}
   *
   * 2. call(alias, action, params, [callback]) // for inner msg.thrift
   *   return remote service calling result
   *   callback(error, result) // if without callback, return a Promise {bluebird}
   *
   * if params error, callback(error, null) or return a promise
   *
   *  {String} alias services alias
   *  {String} action service.action
   *  {Array} params service.action's params
   *  {Function} callback
   *
   *  @return {*|Promises|bluebird}
   */
  call() {
    let self     = this,
        alias    = arguments[0],
        callback = _.isFunction(arguments[1]) ? arguments[1] :
          (_.isFunction(arguments[3]) ? arguments[3] : false);
    // check
    if (!alias || !_.isString(alias)) {
      if (callback) {
        callback(new Error('invalid params'), null);
      } else {
        return Promises.reject('invalid params');
      }
    } else {
      let client = null;
      // init and polling a client
      let defer = self._initBeforeCall(alias)
        .then(() => {
          client = self._clients[alias] ? self._clients[alias].next() : null;
          if (client) {
            return client.client;
          }
          return null;
        });

      // 4 params
      if (arguments.length > 2) {

        let action = arguments[1] || '';

        defer = defer.then(() => {
            if (client) {
              // check permission
              if (client.actions && !client.actions[action]) {
                return Promises.reject('action forbidden');
              }

              return transport.doCall.apply(self, [self._id, client.client].concat(Array.apply(self, arguments)));
            }

            return Promises.reject('no service found');
          })
          .then((rmsg) => {
            let result = JSON.parse(rmsg.res);
            return result.result;
          });
      }
      // callback or return promise
      if (callback) {
        defer.then((data) => {
          callback(null, data);
        }).catch((err) => {
          callback(err, null);
        });
      } else {
        return defer;
      }
    }
  }

  /**
   *
   * @param alias
   * @returns {Promises|bluebird|*}
   * @private
   */
  _initBeforeCall(alias) {
    if (this._clients[alias]) {
      // return a promise
      return Promises.resolve(true);
    } else {
      return this._findServices(alias);
    }
  }

  /**
   * find in redis
   * @param alias
   * @returns {*}
   * @private
   */
  _findServices(alias) {
    let self = this;
    return self._adapter.getListKeys({alias: alias, id: '*'})
      .then((keys) => {
        if (_.isEmpty(keys)) {
          return null;
        }
        // add each one
        if (!self._clients[alias]) {
          self._clients[alias] = new utils.DLinkedList();
          // subscribe
          self._subscribe(alias);
        }

        return self._createClients(alias, keys);
      });
  }

  /**
   * add all thrift service of alias
   * @param {String} alias
   * @param {Array} keys
   * @returns {*}
   * @private
   */
  _createClients(alias, keys) {
    let self = this;
    return self._adapter.getListValues(keys)
      .map((data) => {

        try {
          // parse and check
          data = JSON.parse(data);
          if (data && data.host && data.port) {
            data.id = data.host + ':' + data.port;
            // jump
            if (self._clients[alias].item(data.id)) {
              return null;
            }
            // set id
            // get processor
            let processor = self._thrifts[alias] ? self._thrifts[alias] : Processor;
            // new
            data.connection = thrift.createConnection(data.host, data.port);
            data.client = thrift.createClient(processor, data.connection);
            let clean = () => {
              // delete from _adapter and _clients
              self._clients[alias].remove(data.id);
              self._adapter.del({alias: alias, id: data.id})
                .then(() => {
                  self.emit(EVENT.LOG.INFO,
                    alias + ' delete client ' + data.id);
                })
                .catch((err) => {
                  self.emit(EVENT.LOG.ERROR,
                    alias + ' delete client ' + data.id, err);
                });
            };
            // cannot connect
            data.connection.on('error', clean);
            data.connection.on('close', clean);
            // add
            self._clients[alias].append(data);

            self.emit(EVENT.LOG.INFO, alias + ' add client ' + data.id);
          } else {
            self.emit(EVENT.LOG.ERROR, {
              err: 'Service data error',
              message: data
            });
          }
        } catch (e) {
          self.emit(EVENT.LOG.ERROR, e);
        }
      });
  }

  /**
   * sub scribe on _adapter
   * @param alias
   * @private
   */
  _subscribe(alias) {
    this._adapter.subscribe({alias: alias}, (error, keys) => {
      let newKeys = [];
      if (error) {
        this.emit(EVENT.LOG.ERROR, error);
      } else {
        keys.forEach((key) => {
          let origin = utils.getOriginKey(key);
          if (origin && (alias === origin.alias) && origin.id) {
            if (this._clients[alias] && !this._clients[alias].item(origin.id)) {
              newKeys.push(this._adapter.getKey({alias: alias, id: origin.id}));
            }
          }
        });
      }
      this._createClients(alias, newKeys);
    });
  }
}

exports.ThriftClient = ThriftClient;

