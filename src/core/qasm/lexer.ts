// Hand-written lexer for OpenQASM 2.0.

import type { Diagnostic, Span } from '../diagnostics';

export type TokenKind =
  | 'ident' | 'int' | 'real' | 'string'
  | 'keyword'
  | 'symbol'
  | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  span: Span;
}

const KEYWORDS = new Set([
  'OPENQASM', 'include', 'qreg', 'creg', 'gate', 'opaque',
  'measure', 'reset', 'barrier', 'if', 'pi', 'U', 'CX',
]);

const SYMBOLS = ['->', '==', ';', ',', '(', ')', '[', ']', '{', '}', '+', '-', '*', '/', '^'];

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < source.length) {
    const c = source[i];

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance();
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const start = { line, col };
      advance(2);
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) advance();
      if (i >= source.length) {
        diagnostics.push({ severity: 'error', code: 'E0001', message: 'unterminated block comment', span: { ...start, length: 2 } });
      } else {
        advance(2);
      }
      continue;
    }

    const startLine = line;
    const startCol = col;
    const startI = i;

    if (/[A-Za-z_]/.test(c)) {
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) advance();
      const text = source.slice(startI, i);
      tokens.push({ kind: KEYWORDS.has(text) ? 'keyword' : 'ident', text, span: { line: startLine, col: startCol, length: text.length } });
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let isReal = false;
      while (i < source.length && /[0-9]/.test(source[i])) advance();
      if (source[i] === '.') {
        isReal = true;
        advance();
        while (i < source.length && /[0-9]/.test(source[i])) advance();
      }
      if (source[i] === 'e' || source[i] === 'E') {
        const save = { i, line, col };
        advance();
        if (source[i] === '+' || source[i] === '-') advance();
        if (/[0-9]/.test(source[i] ?? '')) {
          isReal = true;
          while (i < source.length && /[0-9]/.test(source[i])) advance();
        } else {
          i = save.i; line = save.line; col = save.col;
        }
      }
      const text = source.slice(startI, i);
      tokens.push({ kind: isReal ? 'real' : 'int', text, span: { line: startLine, col: startCol, length: text.length } });
      continue;
    }

    if (c === '"') {
      advance();
      while (i < source.length && source[i] !== '"' && source[i] !== '\n') advance();
      if (source[i] !== '"') {
        diagnostics.push({ severity: 'error', code: 'E0002', message: 'unterminated string literal', span: { line: startLine, col: startCol, length: i - startI } });
      } else {
        advance();
      }
      const text = source.slice(startI + 1, Math.max(startI + 1, i - 1));
      tokens.push({ kind: 'string', text, span: { line: startLine, col: startCol, length: i - startI } });
      continue;
    }

    const sym = SYMBOLS.find((s) => source.startsWith(s, i));
    if (sym) {
      advance(sym.length);
      tokens.push({ kind: 'symbol', text: sym, span: { line: startLine, col: startCol, length: sym.length } });
      continue;
    }

    diagnostics.push({
      severity: 'error',
      code: 'E0003',
      message: `unexpected character '${c}'`,
      span: { line: startLine, col: startCol, length: 1 },
    });
    advance();
  }

  tokens.push({ kind: 'eof', text: '', span: { line, col, length: 0 } });
  return { tokens, diagnostics };
}
