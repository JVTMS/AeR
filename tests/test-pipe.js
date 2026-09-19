/**
 * AeR — Teste de Integração: Ping/Pong via Named Pipe
 * Valida toda a cadeia de comunicação C# ↔ Node.js
 *
 * Execução: node test-pipe.js
 */

const net = require('net');
const { randomUUID } = require('crypto');

const PIPE_PATH = '\\\\.\\pipe\\AeR_IPC';
const TIMEOUT_MS = 5000;

console.log('\n⚡ AeR — Teste de Integração: Named Pipe IPC');
console.log('═'.repeat(50));
console.log(`📡 Conectando a: ${PIPE_PATH}`);

const socket = net.createConnection(PIPE_PATH);
let buffer = '';
let testsPassed = 0;
let testsFailed = 0;

socket.setTimeout(TIMEOUT_MS);

socket.on('connect', () => {
  console.log('✅ Conexão Named Pipe estabelecida!\n');
  runTests();
});

socket.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  const lines = buffer.split('\n');
  buffer = lines.pop();
  lines.forEach(line => {
    if (line.trim()) handleResponse(line.trim());
  });
});

socket.on('timeout', () => {
  console.error('❌ TIMEOUT: Sem resposta do backend em 5 segundos.');
  console.error('   Verifique se o backend C# está em execução: dotnet run --project AeR.Api/AeR.Api.csproj');
  socket.destroy();
  process.exit(1);
});

socket.on('error', (err) => {
  console.error(`\n❌ Erro de conexão: ${err.message}`);
  console.error('   Certifique-se de que o backend C# está rodando antes de testar.');
  process.exit(1);
});

socket.on('close', () => {
  console.log('\n' + '═'.repeat(50));
  console.log(`📊 Resultado: ${testsPassed} passou(ram) | ${testsFailed} falhou(ram)`);
  if (testsFailed === 0) {
    console.log('🎉 Passo 2 concluído! IPC Named Pipe funcional.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Alguns testes falharam. Verifique os logs acima.\n');
    process.exit(1);
  }
});

// ── Testes ─────────────────────────────────────────────────────────────────
const pendingTests = new Map();

function sendCommand(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const message = JSON.stringify({ id, command, payload }) + '\n';

    const timer = setTimeout(() => {
      pendingTests.delete(id);
      reject(new Error(`Timeout no comando '${command}'`));
    }, TIMEOUT_MS);

    pendingTests.set(id, { resolve, reject, timer, command });
    socket.write(message);
  });
}

function handleResponse(json) {
  let msg;
  try { msg = JSON.parse(json); } catch { return; }

  if (msg.id && pendingTests.has(msg.id)) {
    const { resolve, reject, timer, command, raw } = pendingTests.get(msg.id);
    clearTimeout(timer);
    pendingTests.delete(msg.id);

    // raw=true: sempre resolve (inclusive com success=false)
    if (raw) resolve(msg);
    else if (msg.success) resolve({ command, data: msg.data });
    else reject(new Error(msg.error));
  }
}

/** Envia comando e sempre resolve (não rejeita para respostas de erro). */
function sendCommandRaw(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const message = JSON.stringify({ id, command, payload }) + '\n';
    const timer = setTimeout(() => {
      pendingTests.delete(id);
      reject(new Error(`Timeout no comando '${command}'`));
    }, TIMEOUT_MS);
    pendingTests.set(id, { resolve, reject, timer, command, raw: true });
    socket.write(message);
  });
}

async function assert(name, fn) {
  process.stdout.write(`  ◆ ${name}... `);
  try {
    await fn();
    console.log('✅ OK');
    testsPassed++;
  } catch (err) {
    console.log(`❌ FALHOU: ${err.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('🧪 Executando testes:\n');

  // Teste 1: Ping básico
  await assert('Ping/Pong — resposta do backend', async () => {
    const t0 = Date.now();
    const result = await sendCommand('ping');
    const latency = Date.now() - t0;
    if (result.data.message !== 'pong') throw new Error(`Esperado 'pong', recebido: ${result.data.message}`);
    console.log(`\n       ↳ Latência: ${latency}ms | Framework: ${result.data.framework} | Uptime: ${result.data.uptimeMs}ms`);
  });

  // Teste 2: Metadados do servidor
  await assert('Metadata do servidor presente', async () => {
    const result = await sendCommand('ping');
    if (!result.data.server) throw new Error('Campo "server" ausente na resposta');
    if (!result.data.timestamp) throw new Error('Campo "timestamp" ausente na resposta');
  });

  // Teste 3: Comando desconhecido retorna erro controlado
  await assert('Comando inválido retorna erro controlado (não crash)', async () => {
    const result = await sendCommandRaw('comando:inexistente');
    if (result.success !== false) throw new Error('Deveria retornar success=false');
    if (!result.error) throw new Error('Campo "error" ausente na resposta de erro');
    console.log(`\n       ↳ Erro recebido corretamente: "${result.error}"`);
  });

  // Teste 4: Múltiplos pings simultâneos (correlação por UUID)
  await assert('3 pings simultâneos com correlação UUID', async () => {
    const [r1, r2, r3] = await Promise.all([
      sendCommand('ping'),
      sendCommand('ping'),
      sendCommand('ping'),
    ]);
    if (r1.data.message !== 'pong') throw new Error('Ping 1 falhou');
    if (r2.data.message !== 'pong') throw new Error('Ping 2 falhou');
    if (r3.data.message !== 'pong') throw new Error('Ping 3 falhou');
  });

  socket.end();
}
