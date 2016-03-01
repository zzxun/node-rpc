/**
 * adapter for pub/sub services
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 * @private
 */
const _ = require('lodash');
const utils = require('./util');

/**
 * using a dependency system (zookeeper or redis etc.) to pub/sub services
 */
class Adapter {

  /**
   * initial
   *
   * @param {Object} options include:
   *   1. name {String} redis/zookeeper/...
   *   2. options {Object} of adapter
   */
  constructor(options) {

    options = _.merge({
      name   : 'zookeeper',
      options: {
        root: utils.KEY({slash: '/', alias: 'thrift', id: 'services'})
      }
    }, options);
    try {
      let adapter = require('./' + options.name);
      this._adapter = new adapter(options.options);
    } catch (e) {
      throw new TypeError('unsupported adapter');
    }
  }

  /**
   * save data to adapter
   *
   * @param {Object} key
   * @param {String|Object} data
   * @param {Number} [ttl] second
   * @returns {*|Promise|bluebird|*}
   */
  publish(key, data, ttl) {
    data = _.isString(data) ? data : JSON.stringify(data);
    return this._adapter.save(key, data, ttl);
  }

  /**
   * get latest key list
   * @param {Object} key
   * @param {Function} cb
   */
  subscribe(key, cb) {
    if (this._adapter.subscribe) {
      this._adapter.subscribe(key, cb);
    }
  }

  /**
   * get key string
   * @param {Object} keyObj
   */
  getKey(keyObj) {
    if (this._adapter.getKey) {
      return this._adapter.getKey(keyObj);
    }
    return utils.getKey(keyObj);
  }

  /**
   * register event cb
   *
   * @param event
   * @param cb
   */
  on(event, cb) {
    if (this._adapter.on && _.isFunction(this._adapter.on)) {
      this._adapter.on(event, cb);
    }
  }

  /**
   * get list nodes or keys
   * @param {Object|String} pattern
   */
  getListKeys(pattern) {
    return this._adapter.getListKeys(pattern);
  }

  /**
   * get values of all keys
   * @param keys
   */
  getListValues(keys) {
    return this._adapter.getListValues(keys);
  }

  /**
   * delete
   * @param key
   * @returns {*}
   */
  del(key) {
    return this._adapter.del(key);
  }
}

module.exports = Adapter;
