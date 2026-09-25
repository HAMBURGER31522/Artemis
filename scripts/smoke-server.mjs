import { startServer } from '../server.mjs';

const { server, host, port } = await startServer({ host: '127.0.0.1', port: 0 });

try {
  const response = await fetch(`http://${host}:${port}/api/health`);
  if (!response.ok) throw new Error(`health returned ${response.status}`);
  const body = await response.json();
  if (body.ok !== true) throw new Error('health payload did not report ok=true');
  console.log(`Server smoke passed on ${host}:${port}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
