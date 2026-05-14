//testscript, um Session-Funktionalität zu testen weil nach add immer 401 gekommen ist

const http = require('http');
const data = JSON.stringify({ username: 'joe', password: '123' });

const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const loginReq = http.request(loginOptions, (loginRes) => {
  console.log('login status', loginRes.statusCode);
  console.log('login cookie', loginRes.headers['set-cookie']);
  let loginBody = '';
  loginRes.on('data', (chunk) => loginBody += chunk);
  loginRes.on('end', () => {
    console.log('login body', loginBody);
    const cookies = loginRes.headers['set-cookie'];
    if (!cookies || cookies.length === 0) {
      console.error('No cookie returned from login');
      return;
    }
    const cookie = cookies[0].split(';')[0];

    const addReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/movies/tt0110357',
      method: 'POST',
      headers: {
        Cookie: cookie,
      },
    }, (addRes) => {
      console.log('add status', addRes.statusCode);
      let addBody = '';
      addRes.on('data', (chunk) => addBody += chunk);
      addRes.on('end', () => {
        console.log('add body', addBody);

        const moviesReq = http.request({
          hostname: 'localhost',
          port: 3000,
          path: '/movies',
          method: 'GET',
          headers: {
            Cookie: cookie,
          },
        }, (moviesRes) => {
          console.log('movies status', moviesRes.statusCode);
          let moviesBody = '';
          moviesRes.on('data', (chunk) => moviesBody += chunk);
          moviesRes.on('end', () => console.log('movies body', moviesBody));
        });
        moviesReq.end();
      });
    });
    addReq.end();
  });
});
loginReq.write(data);
loginReq.end();
