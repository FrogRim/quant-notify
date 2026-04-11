import { buildServer } from './src/server.ts';

async function test() {
  const app = buildServer();
  const res = await app.inject({ method: 'GET', url: '/health' });
  console.log('Status code:', res.statusCode);
  console.log('Body:', res.body);
  console.log('Test passed:', res.statusCode === 200 && JSON.parse(res.body).status === 'ok');
  process.exit(res.statusCode === 200 ? 0 : 1);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
