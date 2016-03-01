/**
 * Copyright (c) 2015 Meizu bigertech, All rights reserved.
 * http://www.bigertech.com/
 * @author zhangxun
 * @date  16/2/18
 * @description
 *
 */
'use strict';

const ThriftServer = require('../index').ThriftServer,
      utils        = require('../lib/util'),
      _            = require('lodash');

// test
let s = new ThriftServer({
  services: [{
    alias  : 'utils',
    service: utils
  }, {
    service: _
  }],
  adapter: {
    name: 'zookeeper'
  }
});

s.on('debug', console.log);
s.on('info', console.log);
s.on('error', console.error);
s.on('ready', console.log);