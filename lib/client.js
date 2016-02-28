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
const ThriftMsg = require('../gen-nodejs/Message'),
      ttypes    = require('../gen-nodejs/msg_types'),
      utils     = require('./util'),
      Adapter   = require('./adapter');

/**
 * manage all thrift client of `ThriftMsg`
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
    // random server id
    this._host = utils.getLocalIPv4();
    this._id = utils.ID(this._host);
    // null
    options = options || {};
    // init redis
    this._adapter = new Adapter(options.adapter);
    // redis on error
    this._adapter.on('error', (err) => {
      this.emit(utils.EVENT.ERROR, options.adapter, err);
    });
    this._adapter.on('ready', (msg) => {
      this.emit(utils.EVENT.READY, msg);
    });
    // all clients
    this._clients = {};
    // thrift
    this._thrifts = {};
    utils.trans2Array(options.thrifts, _.isObject).forEach((thrift) => {
      if (thrift.alias && thrift.processor) {
        this._thrifts[thrift.alias] = thrift.processor;
      }
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
    let alias    = arguments[0],
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
      let defer = this._initBeforeCall(alias)
        .bind(this)
        .then(() => {
          client = this._clients[alias] ? this._clients[alias].next() : null;
          if (client) {
            return client.client;
          }
          return null;
        });

      // 4 params
      if (arguments.length > 2) {
        // other param
        let action = arguments[1] || '',
            params = arguments[2] || [];
        //do inner call
        defer = defer.then(() => {
            if (client) {
              // check permission
              if (client.actions && !client.actions[action]) {
                return Promises.reject('method forbidden');
              }
              // msg
              let cmsg = new ttypes.CMsg({
                base: new ttypes.Base({sender: this._id, id: utils.randStr()}),
                call: new ttypes.Call({name: alias, action: action, params: JSON.stringify(params)})
              });

              return utils.doCall(client.client, cmsg);
            }
            // no client
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
   * @returns {Promise<U>|Thenable<U>|Promise.<T>}
   * @private
   */
  _initBeforeCall(alias) {
    if (this._clients[alias] && this._clients[alias].size() > 0) {
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
    return this._adapter.getListKeys({alias: alias, id: '*'})
      .bind(this)
      .then((keys) => {
        if (_.isEmpty(keys)) {
          return null;
        }
        // add each one
        if (!this._clients[alias]) {
          this._clients[alias] = new utils.DLinkedList();
          // subscribe
          this._subscribe(alias);
        }

        return this._createClients(alias, keys);
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
    return this._adapter.getListValues(keys)
      .bind(this)
      .map((data) => {

        try {
          // parse and check
          data = JSON.parse(data);
          if (data && data.host && data.port) {
            data.id = data.host + ':' + data.port;
            // jump
            if (this._clients[alias].item(data.id)) {
              return null;
            }
            // set id
            // get processor
            let processor = this._thrifts[alias] ? this._thrifts[alias] : ThriftMsg;
            // new
            let connection = thrift.createConnection(data.host, data.port),
                client     = thrift.createClient(processor, connection),
                clean      = () => {
                  // delete from _adapter and _clients
                  this._clients[alias].remove(data.id);
                  this._adapter.del({alias: alias, id: data.id})
                    .then(() => {
                      this.emit(utils.EVENT.LOG,
                        alias + ' delete client ' + data.id);
                    })
                    .catch((err) => {
                      this.emit(utils.EVENT.ERROR,
                        alias + ' delete client ' + data.id, err);
                    });
                };
            // cannot connect
            connection.on('error', clean);
            connection.on('close', clean);
            // add
            this._clients[alias].append(_.merge(data, {
              connection: connection,
              client    : client
            }));

            this.emit(utils.EVENT.LOG, alias + ' add client ' + data.id);
          } else {
            this.emit(utils.EVENT.ERROR, data, 'ignore');
          }
        } catch (e) {
          this.emit(utils.EVENT.ERROR, data, e);
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
        this.emit(utils.EVENT.ERROR, error.message, error);
      } else {
        keys.forEach((key) => {
          let origin = utils.getOriginKey(key);
          if (origin && origin.id) {
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

