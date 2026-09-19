/**
 * AeR — Logger (Utilitário)
 * Logger com níveis, timestamps e encaminhamento para console formatado.
 * Em produção, logs podem ser enviados ao Main Process para persistência.
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LOG_LEVELS.DEBUG; // Mudar para INFO em produção

const COLORS = {
  DEBUG: 'color: hsl(195,60%,60%); font-weight:400',
  INFO:  'color: hsl(145,60%,55%); font-weight:500',
  WARN:  'color: hsl(38,90%,58%);  font-weight:500',
  ERROR: 'color: hsl(355,80%,60%); font-weight:700',
};

function formatTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function log(level, module, ...args) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
  const prefix = `%c[${formatTime()}] [${level}] [${module}]`;
  console.log(prefix, COLORS[level], ...args);
}

export const Logger = {
  debug: (module, ...args) => log('DEBUG', module, ...args),
  info:  (module, ...args) => log('INFO',  module, ...args),
  warn:  (module, ...args) => log('WARN',  module, ...args),
  error: (module, ...args) => log('ERROR', module, ...args),
};
