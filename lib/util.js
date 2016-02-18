/**
 * util common
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const _ = require('lodash');
const Promises = require('bluebird');

/**
 * redis cache key
 * @type {Function}
 * @private
 */
const _REDIS_KEY = _.template('__M:_THRIFT_SERVICE__<%= alias %>__<%= id %>');
// 1 minite
const _REDIS_TTL = 60;
const _ID_LEN = 10;

/**
 * emit events
 */
const EVENT = {
  ERROR: 'error',
  LOG  : 'log'
};

/**
 * trans params to array
 * @param {Array|*} params
 * @param {Function} check non-array params
 * @param {*} [defaultValue] if check false, return defaultValue, d
 */
function trans2Array(params, check, defaultValue) {
  // array
  if (_.isArray(params)) {
    return params;
  } else if (check(params)) {
    return [params];
  }
  return defaultValue || [];
}

/**
 * trans params to object
 * @param {Array|*} params
 * @param {Function} check non-array params
 * @param {*} [defaultValue] if check false, return defaultValue, d
 */
function trans2Obj(params, check, defaultValue) {
  // array
  if (_.isArray(params)) {
    return params;
  } else if (check(params)) {
    return [params];
  }
  return defaultValue || [];
}

/**
 * if param is a function, exe it
 * @param {Function} param
 */
function exec(param) {
  return _.isFunction(param) ? param() : param;
}

/**
 * get a random string
 * @returns {string}
 */
function randStr() {
  return Math.random().toString(36).substring(2);
}

function test() {
  return Promises.resolve('a');
}

/**
 * exports
 */
module.exports = {
  trans2Array: trans2Array,
  exec       : exec,
  randStr    : randStr,
  REDIS_KEY  : _REDIS_KEY,
  REDIS_TTL  : _REDIS_TTL,
  ID_LEN     : _ID_LEN,
  EVENT      : EVENT,
  test       : test
};
