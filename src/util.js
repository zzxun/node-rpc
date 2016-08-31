// Copyright (c) 2016 zzun <xtkml.g@gmail.com>
// 
// This software is released under the MIT License.
// http://opensource.org/licenses/mit-license.php

/**
 * util common
 */
import _ from 'lodash';
import { networkInterfaces } from 'os';
import { createServer } from 'net';
import Promise from 'bluebird';

/**
 * get a random string
 * @returns {string}
 */
function randStr() {
  return Math.random().toString(36).substring(10);
}

exports.randStr = randStr;

/**
 * adapter publish key
 * @type {Function}
 * @private
 */
const KEY = (data) => {
  if (!data.slash) {
    data.slash = '';
  }
  if (!data.id) {
    data.id = '*';
  }
  return _.template('<%= slash %>__M:_THRIFT_SERVICES__<%= alias %>__<%= id %>')(data);
};
exports.KEY = KEY;

/**
 * @return {string}
 */
const ID = (host) => {
  return host + '.' + process.pid + '.' + randStr();
};

exports.ID = ID;

const _KEY_ORIGIN = /^(.*)?__M:_THRIFT_SERVICES__(.*)?__(.*)?$/;

/**
 * @param {String} key
 * @returns {Object}
 */
function getOriginKey(key) {
  let array = _KEY_ORIGIN.exec(key);
  if (array) {
    return {
      slash: array[1],
      alias: array[2],
      id: array[3],
    };
  }
  return null;
}

exports.getOriginKey = getOriginKey;

/**
 * @param {Object|String} key
 * @returns {*}
 */
function getKey(key) {
  if (_.isObject(key)) {
    return KEY(key);
  }
  return key;
}

exports.getKey = getKey;

// 1 hour
exports.TTL = 3600;

/**
 * eth0 for linux, en0 for osx
 */
const _NETWORK_KEYS = ['eth0', 'en0'];

/**
 * emit events
 */
exports.EVENT = {
  LOG: {
    DEBUG: 'debug',
    INFO: 'info',
    ERROR: 'error',
  },

  READY: 'ready',
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

exports.trans2Array = trans2Array;

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

exports.trans2Obj = trans2Obj;

/**
 * if param is a function, exe it
 * @param {Function} param
 */
function exec(param) {
  return _.isFunction(param) ? param() : param;
}

exports.exec = exec;

/**
 * get local ipv4 ip address, using eth0 (linux) en0 (osx)
 */
function getLocalIPv4() {
  let nets = networkInterfaces(),
    ip = '127.0.0.1';

  for (let key in nets) {
    if (nets.hasOwnProperty(key) && _.includes(_NETWORK_KEYS, key)) {
      nets[key].forEach((net) => {
        if (net.family === 'IPv4' && net.internal === false) {
          ip = net.address;
        }
      });
    }
  }

  return ip;
}

exports.getLocalIPv4 = getLocalIPv4;

/**
 * check port in use
 *
 * @param {Number} port
 * @param {Function} callback
 */
function isPortInUse(port, callback) {
  let server = createServer();
  server.listen(port, function () {
    server.once('close', function () {
      callback(port);
    });
    server.close();
  });
  server.on('error', function () {
    isPortInUse(++port, callback);
  });
}

exports.isPortInUse = isPortInUse;

/**
 * get an unused port
 * @param {Number} port default start from 7007, or from use given
 */
function getUnusedPort(port) {
  return new Promise((resolve) => {
    isPortInUse(port, (port) => {
      return resolve(port);
    });
  });

}

exports.getUnusedPort = getUnusedPort;

/**
 * arguments[0] = fn
 * [1]... is arguments
 */
function checkType(fn) {
  if (arguments.length <= 1) {
    return true;
  }
  for (let i = 1; i < arguments.length; i++) {
    if (!fn(arguments[i])) {
      return false;
    }
  }
  return true;
}

exports.checkType = checkType;

/**
 * for thrift client load balance
 */
class DLinkedList {

  constructor() {
    this._head = null;
    this._tail = null;
    this._next = null; // polling next
    this._length = 0;
    this._container = new Map();
  }

  keys() {
    return this._container.keys();
  }

  has(key) {
    return this._container.has(key);
  }

  /**
   * append a data and return the `key`
   * @param data
   * @param [id]
   * @returns {*}
   */
  append(data, id) {
    let key = data.id || id || randStr(),
      newData = {
        id: key,
        data: data,
        next: key,
        prev: key,
      };
    if (this._length === 0) { // the first one
      this._head = key;
      this._tail = key;
      this._next = key;
    } else {
      // append to tail
      this._container.get(this._tail).next = key;
      this._container.get(this._head).prev = key;
      newData.prev = this._tail;
      newData.next = this._head;
      this._tail = key;
    }

    this._length++;
    this._container.set(key, newData);
    return key;
  }

  /**
   * get value by key
   * @param key
   * @returns {V}
   */
  item(key) {
    let data = this._container.get(key);
    if (data) {
      return data.data;
    }
    return null;
  }

  /**
   * get size
   * @returns {Number}
   */
  size() {
    return this._length;
  }

  /**
   * remove value by key
   * @param key
   */
  remove(key) {
    // clear
    if (this._length === 0) {
      return true;
    }
    if (this._length === 1) {
      this.clear();
      return true;
    }

    // linked prev and next
    let cur = this._container.get(key);
    if (cur) {
      let prev = this._container.get(cur.prev),
        next = this._container.get(cur.next);
      prev.next = cur.next;
      next.prev = cur.prev;
      if (this._head === cur.id) {
        this._head = next.id;
        next.prev = cur.prev;
      }
      if (this._tail === cur.id) {
        this._tail = prev.id;
        next.prev = cur.prev;
      }
      if (this._next === cur.id) {
        this._next = next.id;
      }

      this._length--;
      this._container.delete(key);
      return true;
    }

    return false;
  }

  /**
   * get next value
   * @returns {Object}
   */
  next() {
    if (!this._next) {
      return null;
    }
    let cur = this._container.get(this._next);
    if (cur) {
      this._next = cur.next;
      return cur.data;
    }
    return null;
  }

  /**
   * clean all
   */
  clear() {
    this._container.clear();
    this._head = null;
    this._tail = null;
    this._next = null;
    this._length = 0;
  }

}

exports.DLinkedList = DLinkedList;
