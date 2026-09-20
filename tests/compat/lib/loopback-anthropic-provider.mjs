import { createServer } from 'node:http';

function writeEvent(response, event) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function startLoopbackAnthropicProvider() {
  const requests = [];
  let sequence = 0;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: error instanceof Error ? error.message : String(error),
            },
          }),
        );
        return;
      }
      requests.push({ method: request.method, url: request.url, body });

      if (request.url?.includes('/v1/messages/count_tokens')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ input_tokens: 1 }));
        return;
      }
      if (request.method !== 'POST' || !request.url?.includes('/v1/messages')) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'not_found_error', message: 'Not found' },
          }),
        );
        return;
      }

      sequence += 1;
      const messageId = `msg_synthex_compat_${sequence}`;
      const model = body.model ?? 'claude-sonnet-4-5';
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'close',
      });
      writeEvent(response, {
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      });
      writeEvent(response, {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      writeEvent(response, {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'activation captured' },
      });
      writeEvent(response, { type: 'content_block_stop', index: 0 });
      writeEvent(response, {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      });
      writeEvent(response, { type: 'message_stop' });
      response.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Loopback Anthropic provider did not receive a TCP address');
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
