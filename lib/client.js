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
 *         [name='redis'] // redis or zookeeper
 *         [options={}] // options of adapter
 *     }
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
    this._adapter = new Adapter(options.adapter);
    // redis on error
    this._adapter.on('error', (err) => {
      this.emit(utils.EVENT.ERROR, options.adapter, err);
    });
    // all clients
    this._clients = {};
  }

  /**
   * find
   * @param {String} alias services alias
   * @param {String} action service.action
   * @param {Array} [params] service.action's params
   */
  call(alias, action, params) {
    // init
    params = params || [];
    // error
    if (!alias || !action || !_.isArray(params)) {
      return Promises.reject('Invalid params');
    }

    // init one alias
    return this._initBeforeCall(alias)
      .bind(this)
      .then(() => {
        return this._clients[alias].next();
      })
      .then((client) => {
        if (client) {
          // check permission
          if (client.methods && !client.methods[action]) {
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
              action: action,
              params: JSON.stringify(params)
            })
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
            // jump
            if (this._clients[alias].item(data.id)) {
              return null;
            }
            // new
            let connection = thrift.createConnection(data.host, data.port),
                client     = thrift.createClient(ThriftMsg, connection),
                clean      = () => {
                  // delete from _adapter and _clients
                  this._clients[alias].remove(data.id);
                  this._adapter.del({alias: alias, id: data.id})
                    .then(() => {
                      this.emit(utils.EVENT.LOG, 'delete client ' + data.host + ':' + data.port);
                    })
                    .catch((err) => {
                      this.emit(utils.EVENT.ERROR, 'delete client ' + data.host + ':' + data.port, err);
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
          } else {
            this.emit(utils.EVENT.ERROR, data, 'ignore');
          }
        } catch (e) {
          this.emit(utils.EVENT.ERROR, data, e);
        }
      });
  }

}

exports.ThriftClient = ThriftClient;

