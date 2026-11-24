const https = require('https');
const body = JSON.stringify({
  type: "web_service",
  name: "hesab-yar-bot",
  ownerId: "tea-dc24lbqvcj2c73a7ikl0",
  repo: "https://github.com/Hoseinashouri/hesab-yar",
  branch: "main",
  autoDeployTrigger: "commit",
  serviceDetails: {
    region: "virginia",
    plan: "free",
    runtime: "node",
    envSpecificDetails: {
      buildCommand: "npm install",
      startCommand: "node server/bot.js"
    },
    healthCheckPath: "/",
    numInstances: 1
  }
});

const req = https.request({
  hostname: 'api.render.com',
  path: '/v1/services',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rnd_1lZTrlYjy7CwpVohAtKguXoUck9F',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
