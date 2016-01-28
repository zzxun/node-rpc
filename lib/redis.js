/**
 * redis client
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const _ = require('lodash');
const redis = require('redis');

/**
 * for client
 */
class ThriftClientRedis {

  /**
   * redis config of `https://github.com/NodeRedis/node_redis`
   * @param {options} options
   */
  constructor(options) {
    // a new redis client
    this._engine = redis.createClient(options);
    //
  }

  /**
   * get redis client
   * @returns {redis} redis client
   */
  getEngine() {
    return this._engine;
  }

}
