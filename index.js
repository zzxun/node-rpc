/**
 * index.js
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

exports.Server = require('./lib/rpc').ThriftServer;
exports.Client = require('./lib/rpc').ThriftClient;
