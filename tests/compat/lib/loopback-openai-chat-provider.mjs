import { createServer } from 'node:http';

function writeChunk(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function baseChunk(sequence, model, delta, finishReason = null) {
  return {
    id: `chatcmpl-synthex-${sequence}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1_000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function writeResponseEvent(response, event) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

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

function writeResponsesToolCalls(response, model, sequence, skillNames) {
  const responseId = `resp_synthex_${sequence}`;
  const output = skillNames.map((name, index) => ({
    type: 'function_call',
    id: `fc_synthex_${index}`,
    call_id: `call_synthex_${index}`,
    name: 'skill',
    arguments: JSON.stringify({ name }),
    status: 'completed',
  }));
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  writeResponseEvent(response, {
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
  let eventSequence = 1;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    writeResponseEvent(response, {
      type: 'response.output_item.added',
      sequence_number: eventSequence,
      output_index: index,
      item: { ...item, arguments: '', status: 'in_progress' },
    });
    eventSequence += 1;
    writeResponseEvent(response, {
      type: 'response.function_call_arguments.delta',
      sequence_number: eventSequence,
      item_id: item.id,
      output_index: index,
      delta: item.arguments,
    });
    eventSequence += 1;
    writeResponseEvent(response, {
      type: 'response.function_call_arguments.done',
      sequence_number: eventSequence,
      item_id: item.id,
      output_index: index,
      name: item.name,
      arguments: item.arguments,
    });
    eventSequence += 1;
    writeResponseEvent(response, {
      type: 'response.output_item.done',
      sequence_number: eventSequence,
      output_index: index,
      item,
    });
    eventSequence += 1;
  }
  writeResponseEvent(response, {
    type: 'response.completed',
    sequence_number: eventSequence,
    response: responseEnvelope({
      id: responseId,
      model,
      output,
      status: 'completed',
      usage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 2,
      },
    }),
  });
  response.end();
}

function writeResponsesText(response, model, sequence) {
  const responseId = `resp_synthex_${sequence}`;
  const messageId = `msg_synthex_${sequence}`;
  const part = {
    type: 'output_text',
    text: 'activation captured',
    annotations: [],
  };
  const item = {
    id: messageId,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [part],
  };
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  writeResponseEvent(response, {
    type: 'response.output_item.added',
    sequence_number: 0,
    output_index: 0,
    item: { ...item, status: 'in_progress', content: [] },
  });
  writeResponseEvent(response, {
    type: 'response.output_text.delta',
    sequence_number: 1,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    delta: part.text,
  });
  writeResponseEvent(response, {
    type: 'response.output_text.done',
    sequence_number: 2,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    text: part.text,
  });
  writeResponseEvent(response, {
    type: 'response.output_item.done',
    sequence_number: 3,
    output_index: 0,
    item,
  });
  writeResponseEvent(response, {
    type: 'response.completed',
    sequence_number: 4,
    response: responseEnvelope({
      id: responseId,
      model,
      output: [item],
      status: 'completed',
      usage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 2,
      },
    }),
  });
  response.end();
}

export async function startLoopbackOpenAIChatProvider(skillNames) {
  const requests = [];
  let generation = 0;
  let activationRequested = false;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (request.method === 'GET' && request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'synthex-compat',
                object: 'model',
                created: 0,
                owned_by: 'synthex-compat',
              },
            ],
          }),
        );
        return;
      }

      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
      const isChat = request.url === '/v1/chat/completions';
      const isResponses = request.url === '/v1/responses';
      if (request.method !== 'POST' || (!isChat && !isResponses)) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Not found' } }));
        return;
      }

      generation += 1;
      const model = body.model ?? 'synthex-compat';
      const hasSkillTool = (body.tools ?? []).some(
        (tool) => (tool.function?.name ?? tool.name) === 'skill',
      );
      if (isResponses) {
        if (hasSkillTool && !activationRequested) {
          activationRequested = true;
          writeResponsesToolCalls(response, model, generation, skillNames);
        } else {
          writeResponsesText(response, model, generation);
        }
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'close',
      });
      if (hasSkillTool && !activationRequested) {
        activationRequested = true;
        writeChunk(
          response,
          baseChunk(generation, model, {
            role: 'assistant',
            content: null,
            tool_calls: skillNames.map((name, index) => ({
              index,
              id: `synthex-skill-${index}`,
              type: 'function',
              function: { name: 'skill', arguments: JSON.stringify({ name }) },
            })),
          }),
        );
        writeChunk(response, baseChunk(generation, model, {}, 'tool_calls'));
      } else {
        writeChunk(
          response,
          baseChunk(generation, model, {
            role: 'assistant',
            content: 'activation captured',
          }),
        );
        writeChunk(response, baseChunk(generation, model, {}, 'stop'));
      }
      response.end('data: [DONE]\n\n');
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Loopback OpenAI provider did not receive a TCP address');
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
