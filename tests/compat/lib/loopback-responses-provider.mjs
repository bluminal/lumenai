import { createServer } from 'node:http';

function responseEnvelope({ id, model, output, status, usage }) {
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1_000),
    status,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model,
    output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 1,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage,
    user: null,
    metadata: {},
  };
}

function writeEvent(response, event) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeCannedResponse(response, model, sequence) {
  const responseId = `resp_synthex_compat_${sequence}`;
  const messageId = `msg_synthex_compat_${sequence}`;
  const text = 'activation captured';
  const part = { type: 'output_text', text, annotations: [] };
  const pendingItem = {
    id: messageId,
    type: 'message',
    status: 'in_progress',
    role: 'assistant',
    content: [],
  };
  const completeItem = {
    ...pendingItem,
    status: 'completed',
    content: [part],
  };
  const usage = {
    input_tokens: 1,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 1,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 2,
  };

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  writeEvent(response, {
    type: 'response.created',
    sequence_number: 0,
    response: responseEnvelope({
      id: responseId,
      model,
      output: [],
      status: 'in_progress',
      usage: null,
    }),
  });
  writeEvent(response, {
    type: 'response.output_item.added',
    sequence_number: 1,
    output_index: 0,
    item: pendingItem,
  });
  writeEvent(response, {
    type: 'response.content_part.added',
    sequence_number: 2,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  });
  writeEvent(response, {
    type: 'response.output_text.delta',
    sequence_number: 3,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    delta: text,
  });
  writeEvent(response, {
    type: 'response.output_text.done',
    sequence_number: 4,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    text,
  });
  writeEvent(response, {
    type: 'response.content_part.done',
    sequence_number: 5,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    part,
  });
  writeEvent(response, {
    type: 'response.output_item.done',
    sequence_number: 6,
    output_index: 0,
    item: completeItem,
  });
  writeEvent(response, {
    type: 'response.completed',
    sequence_number: 7,
    response: responseEnvelope({
      id: responseId,
      model,
      output: [completeItem],
      status: 'completed',
      usage,
    }),
  });
  response.end();
}

export async function startLoopbackResponsesProvider() {
  const requests = [];
  let sequence = 0;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (request.method !== 'POST' || request.url !== '/v1/responses') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Not found' } }));
        return;
      }

      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        requests.push({ method: request.method, url: request.url, body });
        sequence += 1;
        writeCannedResponse(response, body.model ?? 'synthex-compat', sequence);
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          }),
        );
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Loopback provider did not receive a TCP address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
