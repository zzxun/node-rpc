/**
 * manage zookeeper client
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const _ = require('lodash');
const zookeeper = require('node-zookeeper-client');
const Promises = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const utils = require('./util');

const CreateMode = zookeeper.CreateMode;

class ZookeeperService extends EventEmitter {

  constructor(options) {
    super();

    let self = this;

    self._root = options.root;
    // initial
    options = _.merge({
      connect       : '127.0.0.1:2181',
      sessionTimeout: 200000
    }, options);

    self._zk = zookeeper.createClient(options.connect, options);
    self._zk.once('connected', (err) => {
      if (err) {
        throw err;
      }

      self._connected = true;

      self._createNode(self._root, '', CreateMode.PERSISTENT)
        .then(() => {
          self.emit(utils.EVENT.READY, 'Connected to zookeeper ' + options.connect);
        })
        .catch((err) => {
          throw err;
        });
    });

    setTimeout(() => {
      if (!self._connected) {
        throw new Error('zookeeper connect timeout');
      }
    }, options.sessionTimeout);

    self._zk.connect();
  }

  /**
   * save data to adapter
   *
   * @param {Object} key
   * @param {String|Object} data
   * @returns {Promise|bluebird|*}
   */
  save(key, data) {
    // PERSISTENT for service *
    let folder = this._root + utils.KEY({slash: '/', alias: key.alias});
    let keyStr = folder + utils.KEY({slash: '/', alias: key.alias, id: key.id});
    return this._createNode(folder, '', CreateMode.PERSISTENT)
      .then(() => {
        return this.del(keyStr);
      })
      .then(() => {
        // create `Ephemeral Node` for each providers
        return this._createNode(keyStr, data,
          CreateMode.EPHEMERAL);
      });
  }

  _createNode(path, data, mode) {
    return new Promises((resolve, reject) => {
      this._zk.create(path, new Buffer(data), mode, (error, path) => {

        if (error) {

          if (error.getCode() === zookeeper.Exception.NODE_EXISTS ||
            error.getCode() === zookeeper.Exception.OK) {
            this.emit(utils.EVENT.DEBUG, 'Create or Exist path: ' + (path || this._root));
          } else {
            // other error
            return reject(error);
          }
        }

        return resolve(true);
      });
    });
  }


  /**
   * get key string
   * @param {Object} keyObj
   */
  getKey(keyObj) {
    if (_.isString(keyObj)) {
      return keyObj;
    }
    return this._root + utils.KEY({slash: '/', alias: keyObj.alias}) +
      utils.KEY({slash: '/', alias: keyObj.alias, id: keyObj.id});
  }

  /**
   * subscribe this._root / alias
   * @param {Object} keyObj
   * @param {Function} callback
   */
  subscribe(keyObj, callback) {
    let path = this._root + utils.KEY({slash: '/', alias: keyObj.alias});
    let watcher = (event) => {
      if (event.getType() === zookeeper.Event.NODE_CHILDREN_CHANGED) {
        this._zk.getChildren(path, watcher, (error, childrens) => {
          if (error && error.getCode() !== 0) {
            callback(error, []);
          } else {
            callback(null, childrens);
          }
        });
      }
    };
    this._zk.getChildren(path, watcher, () => {
    });
  }

  /**
   * get all available services key name
   * @param pattern
   * @return {Promise|bluebird|*}
   */
  getListKeys(pattern) {
    pattern = this._root + utils.KEY({slash: '/', alias: pattern.alias});
    return new Promises((resolve, reject) => {
      this._zk.getChildren(pattern, (error, childrens) => {
        if (error && error.getCode() !== 0) {
          return reject(error);
        }
        childrens = _.map(childrens, (child) => {
          return pattern + '/' + child;
        });
        return resolve(childrens);
      });
    });
  }

  /**
   * get values of all keys
   * @param keys
   */
  getListValues(keys) {
    let values = [];
    return Promises.map(keys, (key) => {
      return new Promises((resolve) => {
        this._zk.getData(key, (error, data) => {
          return resolve(data ? data.toString() : '');
        });
      }).then((data) => {
        values.push(data);
      });
    }).then(() => {
      return (values);
    });
  }

  /**
   * delete
   * @param {Object} keyObj
   * @returns {*}
   */
  del(keyObj) {
    let path = this.getKey(keyObj);
    return new Promises((resolve) => {
      this._zk.remove(path, () => {
        return resolve(true);
      });
    });
  }
}

module.exports = ZookeeperService;

