/**
 * Copyright (c) 2015 Meizu bigertech, All rights reserved.
 * http://www.bigertech.com/
 * @author zhangxun
 * @date  16/2/18
 * @description
 *
 */
'use strict';

const ThriftClient = require('../index').ThriftClient;

let c = new ThriftClient();
c.on('log', console.log);
c.on('error', console.error);

c.call('utils', 'randStr').then(console.log).catch(console.error);

c.call('utils', 'test').then(console.log).catch(console.error);

c.call('lo', 'isString', ['a']).then(console.log).catch(console.error);

c.call('lo', 'isString', [1]).then(console.log).catch(console.error);