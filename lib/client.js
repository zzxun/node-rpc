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
      redis     = require('./redis');

/**
 * manage all thrift client of `ThriftMsg`
 * @param {Object} options config include:
 *   {
 *     1. redis // {Object} redis config
 *   }
 */
class ThriftClient extends EventEmitter {

  constructor(options) {
    super();
    // random server id
    this._id = utils.randStr();
    this._host = utils.getLocalIPv4();
    // null
    options = options || {};
    // init redis
    this._cache = new redis(options.redis);
    // redis on error
    this._cache.on('error', (err) => {
      this.emit(utils.EVENT.ERROR, err);
    });
    // all clients
    this._clients = {};
  }

  /**
   * find
   * @param {String} alias services alias
   * @param {String} method service.method
   * @param {Array} [params] service.method's params
   */
  call(alias, method, params) {
    // init
    params = params || [];
    // error
    if (!alias || !method || !_.isArray(params)) {
      return Promises.reject('Invalid params');
    }

    // init one alias
    return this._initBeforeCall(alias)
      .bind(this)
      .then(() => {
        return this._getRandomService(alias);
      })
      .then((client) => {
        if (client) {
          // check permission
          if (client.methods && !client.methods[method]) {
            return Promises.reject('method forbidden');
          }
          // msg
          let cmsg = new ttypes.CMsg({
            base: new ttypes.Base({
              sender: this._id + '.' + this._host,
              id    : utils.randStr()
            }),
            call: new ttypes.Call({
              name: alias,
              method: method,
              params: JSON.stringify(params)
            })
          });

          return ThriftClient._doCall(client.client, cmsg);
        }
        // no client
        return Promises.reject('no service found');
      })
      .then((rmsg) => {
        let result = JSON.parse(rmsg.res);
        return result.result;
      });
  }

  /**
   * @param {Object} client thrift client
   * @param cmsg
   * @returns {bluebird|exports|module.exports}
   * @private
   */
  static _doCall(client, cmsg) {
    return new Promises((resolve, reject) => {
      client.call(cmsg, function (err, rmsg) {
        if (err) {
          return reject(err);
        }
        return resolve(rmsg);
      });
    });
  }

  /**
   *
   * @param alias
   * @returns {Promise<U>|Thenable<U>|Promise.<T>}
   * @private
   */
  _initBeforeCall(alias) {
    if (this._clients[alias]) {
      // async adding
      this._findServices(alias);
      // return a promise
      return Promises.resolve(true);
    } else {
      return this._findServices(alias);
    }
  }

  /**
   * auto Polling
   * @param alias
   * @private
   */
  _getRandomService(alias) {
    if (this._clients[alias]) {
      this._clients[alias].next = this._clients[alias].next || 0;
      let keys = Object.keys(this._clients[alias].handlers);
      if (this._clients[alias].next >= keys.length) {
        this._clients[alias].next = 0;
      }
      return this._clients[alias].handlers[keys[this._clients[alias].next++]];
    }
    return null;
  }

  /**
   * find in redis
   * @param alias
   * @returns {*}
   * @private
   */
  _findServices(alias) {
    return new Promises((resolve, reject) => {
      this._cache.getEngine().keys(utils.REDIS_KEY({alias: alias, id: '*'}), (err, keys) => {
        if (err) {
          return reject(err);
        }
        return resolve(keys);
      });
    }).bind(this)
      .then((keys) => {
        if (_.isEmpty(keys)) {
          return null;
        }
        // add each one
        if (!this._clients[alias]) {
          this._clients[alias] = {handlers: {}};
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
    return Promises.bind(this)
      .then(() => {
        return keys;
      }).map((key) => {
        return this._cache.get(key)
          .bind(this)
          .then((data) => {
            if (data && data.host && data.port) {

              if (this._clients[alias][data.id]) {
                return null;
              }

              // new
              let connection = thrift.createConnection(data.host, data.port),
                  client     = thrift.createClient(ThriftMsg, connection);
              // cannot connect
              connection.on('error', () => {
                // delete from redis
                this._cache.del(key);
                delete this._clients[alias].handlers[data.id];
              });
              connection.on('close', () => {
                // delete from redis and _clients
                this._cache.del(key);
                delete this._clients[alias].handlers[data.id];
              });

              // add
              this._clients[alias].handlers[data.id] = _.merge(data, {
                connection: connection,
                client    : client
              });
            }
          });
      });
  }
}

exports.ThriftClient = ThriftClient;

