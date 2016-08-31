// Copyright (c) 2016 zzun <xtkml.g@gmail.com>
// 
// This software is released under the MIT License.
// http://opensource.org/licenses/mit-license.php

import merge from 'lodash/merge';
import utils from './util';

/**
 * Protocol class
 * 
 * Using a dependency system (zookeeper or redis etc.) to pub/sub services
 */
class Protocol {

  /**
   * initial
   *
   * @param {Object} options include:
   *   1. name {String} redis/zookeeper/..., default use zookeeper
   *   2. rpc {String} distinguish thrift/grpc/...
   *   3. options {Object} options of each `require(${name})`
   */
  constructor(options) {
    // merge default
    options = merge({
      name: 'zookeeper',
      rpc: 'rpc',
    }, options);

    try {
      // require
      let protocol = require(options.name);
      // init protocol
      this.protocol = new protocol(options);
    } catch (e) {
      throw new TypeError(`require error, please \`npm i ${options.name} --save\``);
    }

  }

  /**
   * save data to adapter
   *
   * @param {Object} key
   * @param {String|Object} data
   * @returns {*|Promise|bluebird|*}
   */
  publish(key, data) {
    data = typeof data === 'string' ? data : JSON.stringify(data);
    return this.protocol.save(key, data);
  }

  /**
   * get latest key list
   * @param {Object} key
   * @param {Function} cb
   */
  subscribe(key, cb) {
    if (this.protocol.subscribe) {
      this.protocol.subscribe(key, cb);
    }
  }

  /**
   * get key string
   * @param {Object} keyObj
   */
  getKey(keyObj) {
    if (this.protocol.getKey) {
      return this.protocol.getKey(keyObj);
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
    this.protocol.on(event, cb);
  }

  /**
   * get list nodes or keys
   * @param {Object|String} pattern
   */
  getListKeys(pattern) {
    return this.protocol.getListKeys(pattern);
  }

  /**
   * get values of all keys
   * @param keys
   */
  getListValues(keys) {
    return this.protocol.getListValues(keys);
  }

  /**
   * delete
   * @param key
   * @returns {*}
   */
  del(key) {
    return this.protocol.del(key);
  }

}

export default Protocol;
