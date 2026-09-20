import { createServer } from 'node:http';

function writeStream(response, parts) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  response.write(
    `data: ${JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 1,
        candidatesTokenCount: 1,
        totalTokenCount: 2,
      },
    })}\n\n`,
  );
  response.end();
}

export async function startLoopbackGeminiProvider(skillNames) {
  const requests = [];
  let generation = 0;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          }),
        );
        return;
      }

      requests.push({ method: request.method, url: request.url, body });
      if (request.method === 'POST' && request.url?.includes(':countTokens')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ totalTokens: 1 }));
        return;
      }
      if (
        request.method !== 'POST' ||
        !request.url?.includes(':streamGenerateContent')
      ) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Not found' } }));
        return;
      }

      generation += 1;
      if (generation === 1) {
        writeStream(
          response,
          skillNames.map((name, index) => ({
            functionCall: {
              id: `synthex-activate-${index}`,
              name: 'activate_skill',
              args: { name },
            },
          })),
        );
        return;
      }
      writeStream(response, [{ text: 'activation captured' }]);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Loopback Gemini provider did not receive a TCP address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
