'use strict';

const
  path = require('path'),
  hapi = require('hapi'),
  constants = require('../lib/constants'),
  dataLocation = path.join(constants.DEFAULT_DATA_FOLDER, constants.COMPILED_DATA_SUBFOLDER),
  //bcrypt = require('bcrypt'), // For unhashing passwords
  inert = require('inert'),
  hapiAuthBasic = require('hapi-auth-basic'),
  users = {
    sitecues: {
      username: 'sitecues',
      password: 'cheers',
      //password: '$2a$04$j8zwvAjgBdO2mf143fvjsu8RsqYZTGM/3P3ze1f5Y5DPVdnLpc9l.',   // 'cheers'
      name: 'Sitecues user',
      id: '2133d32a'
    }
  },
  server = new hapi.Server(),
  serverOptions = {
    port: parseInt(process.env.PORT, 10) || 3001,
    routes: {
      cors: true,
      files: {
        relativeTo: dataLocation
      }
    }
  };

server.connection(serverOptions);

server.register(inert, (err) => {
  if (err) {
    throw err;
  }
});

server.register(hapiAuthBasic, (err) => {
  if (err) {
    throw err;
  }
  server.auth.strategy('simple', 'basic', { validateFunc: validate });
  server.route({
    method: 'GET',
    config: {
      auth: 'simple'
    },
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true
      }
    }
  });
});

server.start((err) => {
  if (err) {
    throw err;
  }
  console.log('Server running at:', server.info.uri);
});

function validate(request, username, password, callback) {

  const user = users[username];
  if (!user) {
    return callback(null, false);
  }

  const isPasswordCorrect = password === user.password;
  callback(null, isPasswordCorrect, { id: user.id, name: user.name });

  // bcrypt.compare(password, user.password, (err, isValid) => {
  //   callback(err, isValid, { id: user.id, name: user.name });
  // });
};


