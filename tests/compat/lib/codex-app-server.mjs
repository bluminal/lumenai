import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function listCodexSkills(cwd = '/workspace') {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server'], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      finish(new Error(`codex app-server timed out: ${stderr}`));
    }, 60_000);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.kill('SIGTERM');
      if (error) reject(error);
      else resolve(value);
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish(error));
    child.on('exit', (code) => {
      if (!settled) finish(new Error(`codex app-server exited ${code}: ${stderr}`));
    });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === 1) {
        if (message.error) {
          finish(new Error(`Codex initialize failed: ${JSON.stringify(message.error)}`));
          return;
        }
        send({ method: 'initialized', params: {} });
        send({
          method: 'skills/list',
          id: 2,
          params: { cwds: [cwd], forceReload: true },
        });
      } else if (message.id === 2) {
        if (message.error) {
          finish(new Error(`Codex skills/list failed: ${JSON.stringify(message.error)}`));
          return;
        }
        const groups = message.result?.data ?? [];
        const skills = groups.flatMap((group) => group.skills ?? []);
        finish(null, skills);
      }
    });

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: {
          name: 'synthex-compat',
          title: 'Synthex compatibility tests',
          version: '0.1.0',
        },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

export function activateCodexSkills({ cwd = '/workspace', skills, model }) {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server'], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    const pending = [...skills];
    const completed = [];
    let stderr = '';
    let settled = false;
    let current;
    let nextRequestId = 2;

    const timer = setTimeout(() => {
      finish(
        new Error(
          `codex app-server activation timed out after ${completed.length}/${skills.length} skills: ${stderr}`,
        ),
      );
    }, Math.max(60_000, skills.length * 10_000));

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.kill('SIGTERM');
      if (error) reject(error);
      else resolve(value);
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function startNextThread() {
      current = pending.shift();
      if (!current) {
        finish(null, completed);
        return;
      }
      current.threadRequestId = nextRequestId;
      nextRequestId += 1;
      send({
        method: 'thread/start',
        id: current.threadRequestId,
        params: {
          cwd,
          ...(model ? { model } : {}),
          approvalPolicy: 'never',
          sandbox: 'read-only',
          ephemeral: true,
        },
      });
    }

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish(error));
    child.on('exit', (code) => {
      if (!settled) finish(new Error(`codex app-server exited ${code}: ${stderr}`));
    });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === 1) {
        if (message.error) {
          finish(new Error(`Codex initialize failed: ${JSON.stringify(message.error)}`));
          return;
        }
        send({ method: 'initialized', params: {} });
        startNextThread();
        return;
      }

      if (current && message.id === current.threadRequestId) {
        if (message.error) {
          finish(
            new Error(
              `Codex thread/start failed for ${current.name}: ${JSON.stringify(message.error)}`,
            ),
          );
          return;
        }
        current.threadId = message.result?.thread?.id;
        if (!current.threadId) {
          finish(new Error(`Codex returned no thread ID for ${current.name}`));
          return;
        }
        current.turnRequestId = nextRequestId;
        nextRequestId += 1;
        send({
          method: 'turn/start',
          id: current.turnRequestId,
          params: {
            threadId: current.threadId,
            input: [
              {
                type: 'text',
                text: `$${current.name} Run the compatibility activation probe.`,
              },
              { type: 'skill', name: current.name, path: current.path },
            ],
          },
        });
        return;
      }

      if (current && message.id === current.turnRequestId && message.error) {
        finish(
          new Error(
            `Codex turn/start failed for ${current.name}: ${JSON.stringify(message.error)}`,
          ),
        );
        return;
      }

      if (
        current &&
        message.method === 'item/completed' &&
        message.params?.threadId === current.threadId
      ) {
        current.items ??= [];
        current.items.push(message.params.item);
      }

      if (
        current &&
        message.method === 'turn/completed' &&
        message.params?.threadId === current.threadId
      ) {
        const turn = message.params.turn;
        if (turn?.status !== 'completed') {
          finish(
            new Error(
              `Codex turn failed for ${current.name}: ${JSON.stringify(turn?.error ?? turn)}`,
            ),
          );
          return;
        }
        completed.push({
          name: current.name,
          items: current.items ?? [],
          turn,
        });
        startNextThread();
      }
    });

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: {
          name: 'synthex-compat',
          title: 'Synthex compatibility tests',
          version: '0.1.0',
        },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
